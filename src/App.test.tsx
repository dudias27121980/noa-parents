import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { SharedStore } from './sync/store';
import { createTestServer, TestServer } from './test/testServer';
import { playParkingAlarm } from './utils/audio';

// Sounds are silent in the test browser anyway; the parking alarm is recorded to check when it fires
vi.mock('./utils/audio', async (original) => ({ ...(await original<typeof import('./utils/audio')>()), playParkingAlarm: vi.fn() }));

// Fixed browser clock: the demo schedule is laid out around "now", so every countdown is deterministic
const NOW = new Date('2026-09-26T10:02:00+03:00');

let server: TestServer;
const stores: SharedStore[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  server = createTestServer();
});

afterEach(() => {
  stores.splice(0).forEach((s) => s.stop());
  server.close();
});

/** A station (browser) logged in to the shared server, rendered in its own container */
async function openStation(name = 'עמדה 1', { display = false } = {}) {
  const store = new SharedStore(server.connect(name, { readOnly: display }));
  stores.push(store);
  store.start();
  const user = userEvent.setup();
  const r = render(<App store={store} onLogout={() => {}} />);
  const q = within(r.container);
  await q.findByText('אבני דרך ומשימות קרב');
  const goTo = (label: string) =>
    user.click(within(q.getByRole('navigation', { name: 'ניווט ראשי' })).getByRole('button', { name: new RegExp(`^${label}`) }));
  const card = (text: string) => q.getByText(text, { exact: true }).closest('[title="לחיצה כפולה לעריכה"]') as HTMLElement;
  return { user, q, store, goTo, card };
}

describe('dashboard', () => {
  it('renders the shared state without the black box', async () => {
    const { q } = await openStation();
    expect(q.queryByText(/קופסה שחורה/)).not.toBeInTheDocument();
    expect(q.getByLabelText('עמדה עמדה 1, 1 עמדות מחוברות')).toBeInTheDocument();
  });

  it('runs the target clocks from the browser clock and the schedule', async () => {
    const { q } = await openStation();
    // Active phase 09:35 + 45 min ends 10:20; next phase starts 10:25; now is 10:02:00
    expect(q.getByText('00:18:00')).toBeInTheDocument();
    expect(q.getByText('00:23:00')).toBeInTheDocument();
  });
});

describe('schedule', () => {
  it('edits a row on double-click; the server logs it with the station name', async () => {
    const { user, q, goTo } = await openStation('קצין אג"מ');
    await user.dblClick(q.getByText('החלפת כוחות וריענון'));
    const title = q.getByLabelText('כותרת *');
    await user.clear(title);
    await user.type(title, 'החלפת כוחות - עודכן{Enter}');

    expect(await q.findByText('החלפת כוחות - עודכן')).toBeInTheDocument();
    await goTo('יומן מבצעים');
    const row = (await q.findByText(/עריכת אבן דרך H\+45 "החלפת כוחות - עודכן"/)).closest('tr')!;
    expect(row).toHaveTextContent('קצין אג"מ');
  });

  it('Esc cancels an edit without changes', async () => {
    const { user, q } = await openStation();
    await user.dblClick(q.getByText('החלפת כוחות וריענון'));
    await user.type(q.getByLabelText('כותרת *'), 'XXX{Escape}');
    expect(q.getByText('החלפת כוחות וריענון')).toBeInTheDocument();
    expect(q.queryByText(/XXX/)).not.toBeInTheDocument();
  });

  it('blocks saving an empty title', async () => {
    const { user, q } = await openStation();
    await user.dblClick(q.getByText('החלפת כוחות וריענון'));
    await user.clear(q.getByLabelText('כותרת *'));
    expect(q.getByRole('button', { name: 'שמירה' })).toBeDisabled();
  });

  it('the + row adds a new line on the server; cancelling a draft sends nothing', async () => {
    const { user, q, card } = await openStation();
    const rows = () => q.getAllByTitle('לחיצה כפולה לעריכה').length;
    const before = rows();

    await user.click(q.getByRole('button', { name: /הוספת שורה ללו״ז/ }));
    await user.keyboard('{Escape}');
    expect(rows()).toBe(before);
    expect(server.core.getState().milestones).toHaveLength(before);

    await user.click(q.getByRole('button', { name: /הוספת שורה ללו״ז/ }));
    const title = q.getByLabelText('כותרת *');
    await user.clear(title);
    await user.type(title, 'פינוי כוחות{Enter}');
    await waitFor(() => expect(rows()).toBe(before + 1));
    // Starts when the last row ends (demo last row: 11:10 + 30 min); id assigned by the server
    expect(card('פינוי כוחות')).toHaveTextContent('26.09.26 · 11:40–12:10');
    expect(server.core.getState().milestones.find((m) => m.title === 'פינוי כוחות')?.id).toMatch(/^MS-\d+$/);
  });

  it('completing the active phase promotes the next one', async () => {
    const { user, q, card } = await openStation();
    await user.click(q.getByRole('button', { name: /סמן כהושלם/ }));
    await waitFor(() => expect(card('החלפת כוחות וריענון')).toHaveTextContent('פעיל כעת'));
    expect(card('סיכום ביניים ותחקיר חם')).toHaveTextContent('הבא בתור');
  });

  it('shows the end date for a row that crosses midnight', async () => {
    const { user, q, card } = await openStation();
    await user.dblClick(q.getByText('החלפת כוחות וריענון'));
    const time = q.getByLabelText('שעת התחלה *');
    await user.clear(time);
    await user.type(time, '23:40{Enter}');
    await waitFor(() => expect(card('החלפת כוחות וריענון')).toHaveTextContent('23:40–00:20 (27.09.26)'));
  });
});

describe('frequency and shift', () => {
  it('main net frequency accepts exactly 4 digits', async () => {
    const { user, q } = await openStation();
    await user.dblClick(q.getByTitle('לחיצה כפולה לשינוי תדר'));
    const input = q.getByLabelText('תדר (4 ספרות)');
    await user.clear(input);
    await user.type(input, '12ab');
    expect(input).toHaveValue('12');
    expect(q.getByRole('button', { name: '✓' })).toBeDisabled();

    await user.type(input, '345{Enter}');
    await waitFor(() => expect(q.getByTitle('לחיצה כפולה לשינוי תדר')).toHaveTextContent('1234'));
  });

  it('shift commander can be changed', async () => {
    const { user, q } = await openStation();
    await user.dblClick(q.getByTitle('לחיצה כפולה לשינוי משמרת ומפקד'));
    const commander = q.getByLabelText('מפקד משמרת');
    await user.clear(commander);
    await user.type(commander, 'סנ"צ לוי{Enter}');
    await waitFor(() => expect(q.getByTitle('לחיצה כפולה לשינוי משמרת ומפקד')).toHaveTextContent('מפקד: סנ"צ לוי'));
  });
});

describe('forces, incidents and agencies', () => {
  it('rejects a duplicate call sign and carries a rename into incident assignments', async () => {
    const { user, q, goTo } = await openStation();
    await goTo('כוחות');
    await user.dblClick(q.getByText('סיור 21', { exact: true }));
    const callSign = q.getByLabelText(/אות קריאה/);
    await user.clear(callSign);
    await user.type(callSign, 'סיור 14');
    expect(q.getByRole('button', { name: 'שמירה' })).toBeDisabled();

    await user.clear(callSign);
    await user.type(callSign, 'סיור 22{Enter}');
    await q.findByText('סיור 22', { exact: true });
    await goTo('אירועים');
    expect(q.getByText(/סיור 22, רחפן תרמי/)).toBeInTheDocument();
  });

  it('a newly opened incident appears at the top of the list', async () => {
    const { user, q, goTo } = await openStation();
    await goTo('אירועים');
    await user.click(q.getByRole('button', { name: /פתיחת אירוע/ }));
    await user.type(q.getByPlaceholderText('כותרת האירוע *'), 'האירוע החדש ביותר');
    await user.click(q.getByRole('button', { name: 'פתח אירוע' }));
    await q.findByText('האירוע החדש ביותר');
    const titles = q.getAllByText(/^INC-\d+$/).map((el) => el.closest('li')!.textContent);
    expect(titles[0]).toContain('האירוע החדש ביותר');
  });

  it('edits an incident tier', async () => {
    const { user, q } = await openStation();
    await user.click(within(q.getByRole('navigation', { name: 'ניווט ראשי' })).getByRole('button', { name: /^אירועים/ }));
    await user.dblClick(q.getByText('דיווח על התקהלות'));
    await user.selectOptions(q.getByLabelText('דרג'), '1');
    await user.click(q.getByRole('button', { name: 'שמירה' }));
    await waitFor(() => expect(q.getByText('דיווח על התקהלות').closest('li')).toHaveTextContent('דחוף - סכנת חיים'));
  });

  it('switching an agency to phone requires a valid number', async () => {
    const { user, q, goTo, card } = await openStation();
    await goTo('גורמי חוץ');
    await user.dblClick(q.getByText('כבאות והצלה'));
    await user.selectOptions(q.getByLabelText('אמצעי קשר'), 'phone');
    const phone = q.getByLabelText('מספר טלפון *');
    await user.type(phone, 'abc');
    expect(q.getByRole('button', { name: 'שמירה' })).toBeDisabled();

    await user.clear(phone);
    await user.type(phone, '02-6250000{Enter}');
    await waitFor(() => expect(card('כבאות והצלה')).toHaveTextContent('02-6250000'));
    expect(card('כבאות והצלה')).not.toHaveTextContent('2140');
  });
});

describe('several stations', () => {
  it('a change at one station appears at every other station, and presence is shared', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    await waitFor(() => expect(a.q.getByLabelText('עמדה עמדה א, 2 עמדות מחוברות')).toBeInTheDocument());

    await a.user.dblClick(a.q.getByTitle('לחיצה כפולה לשינוי תדר'));
    const input = a.q.getByLabelText('תדר (4 ספרות)');
    await a.user.clear(input);
    await a.user.type(input, '2750{Enter}');

    await waitFor(() => expect(b.q.getByTitle('לחיצה כפולה לשינוי תדר')).toHaveTextContent('2750'));
  });

  it('an urgent incident opened at one station alerts the others', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    await a.goTo('אירועים');
    await a.user.click(a.q.getByRole('button', { name: /פתיחת אירוע/ }));
    await a.user.type(a.q.getByPlaceholderText('כותרת האירוע *'), 'ירי בצומת');
    await a.user.selectOptions(a.q.getByDisplayValue(/דרג 2/), '1');
    await a.user.click(a.q.getByRole('button', { name: 'פתח אירוע' }));

    expect(await b.q.findByText('עמדה א: אירוע דחוף נפתח: ירי בצומת')).toBeInTheDocument();
    expect(a.q.queryByText(/אירוע דחוף נפתח/)).not.toBeInTheDocument();
  });

  it('two stations editing different fields of the same incident keep both changes', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    await a.goTo('אירועים');
    await b.goTo('אירועים');

    // Both open the editor on the same incident before either saves
    await a.user.dblClick(a.q.getByText('דיווח על התקהלות'));
    await b.user.dblClick(b.q.getByText('דיווח על התקהלות'));

    const title = a.q.getByLabelText('כותרת *');
    await a.user.clear(title);
    await a.user.type(title, 'התקהלות - עודכן{Enter}');
    // A's change reaches the server (and B's state) while B's editor is still open with the old title
    await waitFor(() => expect(server.core.getState().incidents.find((i) => i.id === 'INC-7238')!.title).toBe('התקהלות - עודכן'));
    expect(b.q.getByLabelText('כותרת *')).toHaveValue('דיווח על התקהלות');

    const location = b.q.getByLabelText('מיקום');
    await b.user.clear(location);
    await b.user.type(location, 'צומת הגוש{Enter}');

    await waitFor(() => {
      const inc = server.core.getState().incidents.find((i) => i.id === 'INC-7238')!;
      expect(inc.title).toBe('התקהלות - עודכן');
      expect(inc.location).toBe('צומת הגוש');
    });
  });

  it('incidents created at the same moment by two stations get different numbers', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    const [ra, rb] = await Promise.all([
      a.store.dispatch({ type: 'incident.add', incident: { title: 'מעמדה א' } }),
      b.store.dispatch({ type: 'incident.add', incident: { title: 'מעמדה ב' } }),
    ]);
    expect(ra.ok && rb.ok).toBe(true);
    expect(ra.ok && rb.ok && ra.id !== rb.id).toBe(true);
  });

  it('reset at one station resets every station', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    await a.user.dblClick(a.q.getByText('החלפת כוחות וריענון'));
    const title = a.q.getByLabelText('כותרת *');
    await a.user.clear(title);
    await a.user.type(title, 'לפני איפוס{Enter}');
    await b.q.findByText('לפני איפוס');

    await a.user.click(a.q.getByRole('button', { name: /איפוס לנתוני הדגמה/ }));
    await a.user.click(a.q.getByRole('button', { name: /לחץ שוב לאישור/ }));
    await waitFor(() => expect(b.q.getByText('החלפת כוחות וריענון')).toBeInTheDocument());
    expect(b.q.queryByText('לפני איפוס')).not.toBeInTheDocument();
  });
});

describe('connection to the server', () => {
  it('while disconnected: a banner, no editing; on reconnect everything is current again', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');

    server.setReachable(false);
    expect(await a.q.findByRole('alert')).toHaveTextContent('מנותק מהשרת');
    expect(a.q.getByRole('main')).toHaveAttribute('inert');

    // A change made elsewhere during the outage (directly on the server)
    server.core.dispatch('עמדה ב', { type: 'frequency.set', frequency: '3030' });

    server.setReachable(true);
    await waitFor(() => expect(a.q.queryByRole('alert')).not.toBeInTheDocument(), { timeout: 5000 });
    expect(a.q.getByRole('main')).not.toHaveAttribute('inert');
    expect(a.q.getByTitle('לחיצה כפולה לשינוי תדר')).toHaveTextContent('3030');
    await waitFor(() => expect(b.q.getByTitle('לחיצה כפולה לשינוי תדר')).toHaveTextContent('3030'), { timeout: 5000 });
  });

  it('an action while offline is refused with a message instead of being silently lost', async () => {
    const a = await openStation('עמדה א');
    server.setReachable(false);
    await a.q.findByRole('alert');
    const r = await a.store.dispatch({ type: 'frequency.set', frequency: '4444' });
    expect(r).toEqual({ ok: false, error: 'אין חיבור לשרת - השינוי לא נשמר' });
  });
});

describe('everything is editable', () => {
  it('phase tasks: tick off, add, rename and delete from the phase window', async () => {
    const { user, q } = await openStation();
    await user.click(q.getByRole('button', { name: 'משימות 1/4' }));
    const dialog = within(q.getByRole('dialog'));

    await user.click(dialog.getByRole('button', { name: 'לא בוצע: סריקת מבנים 1-12' }));
    await dialog.findByRole('button', { name: 'בוצע: סריקת מבנים 1-12' });

    await user.type(dialog.getByLabelText('משימה חדשה'), 'דיווח לחפ"ק{Enter}');
    expect(await dialog.findByText('דיווח לחפ"ק')).toBeInTheDocument();

    await user.dblClick(dialog.getByText('דיווח לחפ"ק'));
    const edit = dialog.getByLabelText('עריכת משימה');
    await user.clear(edit);
    await user.type(edit, 'דיווח לחפ"ק כל 10 דקות{Enter}');
    expect(await dialog.findByText('דיווח לחפ"ק כל 10 דקות')).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'מחיקת משימה: דיווח לחפ"ק כל 10 דקות' }));
    await waitFor(() => expect(dialog.queryByText('דיווח לחפ"ק כל 10 דקות')).not.toBeInTheDocument());
    expect(dialog.getByText('2/4 בוצעו')).toBeInTheDocument();
  });

  it('a completed phase can be reopened', async () => {
    const { user, q, card } = await openStation();
    await user.click(q.getAllByRole('button', { name: 'פרטים' })[0]);
    await user.click(within(q.getByRole('dialog')).getByRole('button', { name: /ביטול השלמה/ }));
    await waitFor(() => expect(card('כינוס מפקדים ותדריך פתיחה')).not.toHaveTextContent('הושלם בהצלחה'));
  });

  it('forces: add a new force and remove one', async () => {
    const { user, q, goTo } = await openStation();
    await goTo('כוחות');
    await user.click(q.getByRole('button', { name: /הוספת כוח/ }));
    await user.type(q.getByLabelText(/אות קריאה/), 'סיור 50');
    await user.click(q.getByRole('button', { name: 'שמירה' }));
    expect(await q.findByText('סיור 50', { exact: true })).toBeInTheDocument();

    await user.dblClick(q.getByText('סיור 33', { exact: true }));
    await user.click(q.getByRole('button', { name: /מחיקה/ }));
    await user.click(q.getByRole('button', { name: 'מחק' }));
    await waitFor(() => expect(q.queryByText('סיור 33', { exact: true })).not.toBeInTheDocument());
  });

  it('dragging a force on the map moves it for every station', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    await a.goTo('מפה טקטית');
    await b.goTo('מפה טקטית');

    const marker = a.q.getByRole('button', { name: 'נשר 1' });
    const map = marker.parentElement!;
    // jsdom has no layout: give the map a 1000x750 box and pointer capture
    map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 750, right: 1000, bottom: 750, x: 0, y: 0, toJSON() {} });
    marker.setPointerCapture = () => {};

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 480, clientY: 345 });
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 200, clientY: 600 });
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 200, clientY: 600 });

    await waitFor(() => expect(server.core.getState().units.find((u) => u.callSign === 'נשר 1')).toMatchObject({ x: 20, y: 80 }));
    await waitFor(() => expect(b.q.getByRole('button', { name: 'נשר 1' })).toHaveStyle({ left: '20%', top: '80%' }));
  });

  it('routes: closing a route updates the map board and the KPI card', async () => {
    const { user, q, goTo } = await openStation();
    await goTo('מפה טקטית');
    await user.dblClick(q.getByText('ציר 60', { exact: true }));
    await user.selectOptions(q.getByLabelText('מצב'), 'closed');
    await user.type(q.getByLabelText('הערה'), 'חפץ חשוד');
    await user.click(q.getByRole('button', { name: 'שמירה' }));

    const kpi = q.getByText('צירים פתוחים').closest('button')!;
    await waitFor(() => expect(kpi).toHaveTextContent('4/6'));
    expect(kpi).toHaveTextContent('ציר 60 סגור');
  });

  it('parking: one click marks a lot full at one station; the tile and the other station follow', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    const tile = (st: typeof a) => st.q.getByRole('button', { name: /תמונת מצב חניונים/ });
    expect(tile(a)).toHaveTextContent('7/7');
    expect(tile(a)).toHaveTextContent('כל החניונים פנויים');

    await a.user.click(tile(a));
    const dialog = within(a.q.getByRole('dialog'));
    const lot = (name: string) => dialog.getByText(name, { exact: true }).closest('[data-lot]') as HTMLElement;
    await a.user.click(within(lot('מנחת')).getByRole('button', { name: 'מלא' }));

    await waitFor(() => expect(tile(a)).toHaveTextContent('6/7'));
    expect(tile(a)).toHaveTextContent('מלאים: מנחת');
    expect(within(lot('מנחת')).getByRole('button', { name: 'מלא' })).toHaveAttribute('aria-pressed', 'true');
    // The other station: alerted, and its tile agrees
    expect(await b.q.findByText('עמדה א: חניון מנחת מלא')).toBeInTheDocument();
    await waitFor(() => expect(tile(b)).toHaveTextContent('מלאים: מנחת'));

  });

  it('parking occupancy: percent per lot, the tile steps green → yellow → orange → red, and 90% sounds the alarm', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    const tile = (st: typeof a) => st.q.getByRole('button', { name: /תמונת מצב חניונים/ });
    const toneOf = (st: typeof a) => tile(st).className;
    await a.user.click(tile(a));
    const dialog = within(a.q.getByRole('dialog'));
    const lot = (name: string) => dialog.getByText(name, { exact: true }).closest('[data-lot]') as HTMLElement;

    // Enter the capacity and the vehicles so far (double-click)
    await a.user.dblClick(lot('מאוחדת'));
    expect(dialog.getByLabelText('שם החניון *')).toHaveValue('מאוחדת');
    await a.user.type(dialog.getByLabelText('קיבולת רכבים בחניון *'), '100');
    await a.user.clear(dialog.getByLabelText('כמה רכבים עד עכשיו'));
    await a.user.type(dialog.getByLabelText('כמה רכבים עד עכשיו'), '20');
    expect(dialog.getByText('תפוסה: 20%')).toBeInTheDocument();
    await a.user.click(dialog.getByRole('button', { name: 'שמירה' }));

    await waitFor(() => expect(within(lot('מאוחדת')).getByTestId('lot-percent')).toHaveTextContent('20%'));
    await waitFor(() => expect(tile(a)).toHaveTextContent('20%'));
    expect(tile(a)).toHaveTextContent('20/100 רכבים · 80 מקומות פנויים');
    expect(toneOf(a)).toContain('emerald');

    // Quick update on the card: type and Enter
    const count = () => within(lot('מאוחדת')).getByLabelText('רכבים כרגע במאוחדת');
    const setCount = async (n: number) => {
      await a.user.clear(count());
      await a.user.type(count(), `${n}{Enter}`);
    };
    await setCount(50);
    await waitFor(() => expect(toneOf(a)).toContain('yellow'));
    await setCount(75);
    await waitFor(() => expect(toneOf(a)).toContain('orange'));
    expect(playParkingAlarm).not.toHaveBeenCalled();

    // 89 → still orange; + reaches 90%: red at both stations, the alarm sounds at each, once
    await setCount(89);
    await waitFor(() => expect(tile(a)).toHaveTextContent('89%'));
    await a.user.click(within(lot('מאוחדת')).getByRole('button', { name: 'עוד רכב במאוחדת' }));
    await waitFor(() => expect(toneOf(a)).toContain('red'));
    await waitFor(() => expect(toneOf(b)).toContain('red'));
    expect(playParkingAlarm).toHaveBeenCalledTimes(2);
    // The lot and the overall picture crossed together: one alarm, one message naming both
    expect(await a.q.findByText('חניון מאוחדת הגיע ל-90% · תפוסת החניונים הגיעה ל-90%')).toBeInTheDocument();
    // Staying red does not repeat it
    await a.user.click(within(lot('מאוחדת')).getByRole('button', { name: 'עוד רכב במאוחדת' }));
    await waitFor(() => expect(tile(a)).toHaveTextContent('91%'));
    expect(playParkingAlarm).toHaveBeenCalledTimes(2);

    // A count above the capacity is not sent
    await setCount(150);
    await waitFor(() => expect(count()).toHaveValue('91'));
  });

  it('parking: a single lot reaching 90% sounds the alarm even while the overall occupancy is low', async () => {
    const a = await openStation('עמדה א');
    const tile = () => a.q.getByRole('button', { name: /תמונת מצב חניונים/ });
    await a.user.click(tile());
    const dialog = within(a.q.getByRole('dialog'));
    const lot = (name: string) => dialog.getByText(name, { exact: true }).closest('[data-lot]') as HTMLElement;
    const setUp = async (name: string, capacity: number, occupied: number) => {
      await a.user.dblClick(lot(name));
      await a.user.type(dialog.getByLabelText('קיבולת רכבים בחניון *'), String(capacity));
      await a.user.clear(dialog.getByLabelText('כמה רכבים עד עכשיו'));
      await a.user.type(dialog.getByLabelText('כמה רכבים עד עכשיו'), String(occupied));
      await a.user.click(dialog.getByRole('button', { name: 'שמירה' }));
    };
    await setUp('מאוחדת', 100, 10);
    await setUp('מנחת', 10, 8);
    await waitFor(() => expect(tile()).toHaveTextContent('16%'));
    expect(playParkingAlarm).not.toHaveBeenCalled();

    await a.user.click(within(lot('מנחת')).getByRole('button', { name: 'עוד רכב במנחת' }));
    expect(await a.q.findByText('חניון מנחת הגיע ל-90%')).toBeInTheDocument();
    expect(playParkingAlarm).toHaveBeenCalledTimes(1);
    expect(tile().className).toContain('emerald'); // overall 17%: the tile stays green

    // Staying red, or another lot's change, does not repeat it
    await a.user.click(within(lot('מנחת')).getByRole('button', { name: 'עוד רכב במנחת' }));
    await a.user.click(within(lot('מאוחדת')).getByRole('button', { name: 'עוד רכב במאוחדת' }));
    await waitFor(() => expect(tile()).toHaveTextContent('19%'));
    expect(playParkingAlarm).toHaveBeenCalledTimes(1);

    // Dropping below 90% and crossing again sounds it again
    await a.user.click(within(lot('מנחת')).getByRole('button', { name: 'פחות רכב במנחת' }));
    await a.user.click(within(lot('מנחת')).getByRole('button', { name: 'פחות רכב במנחת' }));
    await waitFor(() => expect(within(lot('מנחת')).getByTestId('lot-percent')).toHaveTextContent('80%'));
    await a.user.click(within(lot('מנחת')).getByRole('button', { name: 'עוד רכב במנחת' }));
    await waitFor(() => expect(playParkingAlarm).toHaveBeenCalledTimes(2));
  });

  it('drill scenarios can be added and triggered', async () => {
    const { user, q } = await openStation();
    await user.click(q.getByRole('button', { name: /הפעלת תרגיל קיצון/ }));
    const dialog = within(q.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: /הוספת תרחיש/ }));
    await user.type(dialog.getByLabelText('שם תרחיש *'), 'שריפה במחסן');
    await user.click(dialog.getByRole('button', { name: 'שמירה' }));
    await user.click(await dialog.findByText('שריפה במחסן'));
    await user.click(dialog.getByRole('button', { name: /הפעל תרגיל/ }));
    await waitFor(() => expect(server.core.getState().incidents.some((i) => i.title === 'תרגיל קיצון: שריפה במחסן')).toBe(true));
  });

  it('the HQ name can be renamed and every station sees it', async () => {
    const a = await openStation('עמדה א');
    const b = await openStation('עמדה ב');
    await a.user.dblClick(a.q.getByTitle('לחיצה כפולה לשינוי שם'));
    const input = a.q.getByLabelText('שם החפ"ק');
    await a.user.clear(input);
    await a.user.type(input, 'חפ"ק מרחב בנימין{Enter}');
    await waitFor(() => expect(b.q.getByTitle('לחיצה כפולה לשינוי שם')).toHaveTextContent('חפ"ק מרחב בנימין'));
  });
});

describe('wall display', () => {
  it('shows the live picture read-only, and is listed as a display', async () => {
    const a = await openStation('עמדה א');
    const wall = await openStation('מסך קיר', { display: true });

    expect(wall.q.getByText('עמדת תצוגה · קריאה בלבד')).toBeInTheDocument();
    expect(wall.q.getByRole('main')).toHaveAttribute('inert');
    expect(wall.q.getByLabelText('רמת כוננות')).toBeDisabled();
    expect(wall.q.queryByTitle('לחיצה כפולה לשינוי שם')).not.toBeInTheDocument();
    // Navigation between screens still works on the wall
    await wall.goTo('כוחות');
    expect(wall.q.getByText('סד״כ כוחות בגזרה')).toBeInTheDocument();

    await waitFor(() =>
      expect(a.q.getByLabelText(/עמדות מחוברות/).getAttribute('title')).toContain('מסך קיר (תצוגה)')
    );

    // Changes made at a working station appear on the wall
    await a.goTo('כוחות');
    await a.user.dblClick(a.q.getByText('סיור 21', { exact: true }));
    const callSign = a.q.getByLabelText(/אות קריאה/);
    await a.user.clear(callSign);
    await a.user.type(callSign, 'סיור 77{Enter}');
    expect(await wall.q.findByText('סיור 77', { exact: true })).toBeInTheDocument();
  });

  it('the server refuses a change even if the display page is tampered with', async () => {
    const wall = await openStation('מסך קיר', { display: true });
    const r = await wall.store.dispatch({ type: 'frequency.set', frequency: '9999' });
    expect(r).toEqual({ ok: false, error: 'עמדת תצוגה - קריאה בלבד' });
    expect(server.core.getState().mainFrequency).toBe('1480');
  });
});
