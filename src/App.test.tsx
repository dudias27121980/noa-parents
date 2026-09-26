import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Fixed browser clock: the demo schedule is laid out around "now", so every countdown is deterministic
const NOW = new Date('2026-09-26T10:02:00+03:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

const setup = () => {
  const user = userEvent.setup();
  const utils = render(<App />);
  return { user, ...utils };
};

const goTo = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(within(screen.getByRole('navigation', { name: 'ניווט ראשי' })).getByRole('button', { name: new RegExp(`^${label}`) }));

const card = (text: string) => screen.getByText(text, { exact: true }).closest('[title="לחיצה כפולה לעריכה"]') as HTMLElement;

describe('dashboard', () => {
  it('renders the main screen without the black box', () => {
    setup();
    expect(screen.getByText('אבני דרך ומשימות קרב')).toBeInTheDocument();
    expect(screen.queryByText(/קופסה שחורה/)).not.toBeInTheDocument();
  });

  it('runs the target clocks from the browser clock and the schedule', () => {
    setup();
    // Active phase 09:35 + 45 min ends 10:20; next phase starts 10:25; now is 10:02:00
    expect(screen.getByText('00:18:00')).toBeInTheDocument();
    expect(screen.getByText('00:23:00')).toBeInTheDocument();
  });
});

describe('schedule', () => {
  it('edits a row on double-click and records it in the log', async () => {
    const { user } = setup();
    await user.dblClick(screen.getByText('החלפת כוחות וריענון'));
    const title = screen.getByLabelText('כותרת *');
    await user.clear(title);
    await user.type(title, 'החלפת כוחות - עודכן{Enter}');

    expect(screen.getByText('החלפת כוחות - עודכן')).toBeInTheDocument();
    await goTo(user, 'יומן מבצעים');
    expect(screen.getByText(/עריכת אבן דרך H\+45 "החלפת כוחות - עודכן"/)).toBeInTheDocument();
  });

  it('Esc cancels an edit without changes', async () => {
    const { user } = setup();
    await user.dblClick(screen.getByText('החלפת כוחות וריענון'));
    await user.type(screen.getByLabelText('כותרת *'), 'XXX{Escape}');
    expect(screen.getByText('החלפת כוחות וריענון')).toBeInTheDocument();
    expect(screen.queryByText(/XXX/)).not.toBeInTheDocument();
  });

  it('blocks saving an empty title', async () => {
    const { user } = setup();
    await user.dblClick(screen.getByText('החלפת כוחות וריענון'));
    await user.clear(screen.getByLabelText('כותרת *'));
    expect(screen.getByRole('button', { name: 'שמירה' })).toBeDisabled();
  });

  it('the + row adds a new schedule line; cancelling an unsaved one discards it', async () => {
    const { user } = setup();
    const rows = () => screen.getAllByTitle('לחיצה כפולה לעריכה').length;
    const before = rows();

    await user.click(screen.getByRole('button', { name: /הוספת שורה ללו״ז/ }));
    await user.keyboard('{Escape}');
    expect(rows()).toBe(before);

    await user.click(screen.getByRole('button', { name: /הוספת שורה ללו״ז/ }));
    const title = screen.getByLabelText('כותרת *');
    await user.clear(title);
    await user.type(title, 'פינוי כוחות{Enter}');
    expect(rows()).toBe(before + 1);
    // Starts when the last row ends (demo last row: 11:10 + 30 min)
    expect(card('פינוי כוחות')).toHaveTextContent('26.09.26 · 11:40–12:10');
  });

  it('completing the active phase promotes the next one', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /סמן כהושלם/ }));
    expect(card('החלפת כוחות וריענון')).toHaveTextContent('פעיל כעת');
    expect(card('סיכום ביניים ותחקיר חם')).toHaveTextContent('הבא בתור');
  });

  it('shows the end date for a row that crosses midnight', async () => {
    const { user } = setup();
    await user.dblClick(screen.getByText('החלפת כוחות וריענון'));
    const time = screen.getByLabelText('שעת התחלה *');
    await user.clear(time);
    await user.type(time, '23:40{Enter}');
    expect(card('החלפת כוחות וריענון')).toHaveTextContent('23:40–00:20 (27.09.26)');
  });
});

describe('frequency and shift', () => {
  it('main net frequency accepts exactly 4 digits', async () => {
    const { user } = setup();
    await user.dblClick(screen.getByTitle('לחיצה כפולה לשינוי תדר'));
    const input = screen.getByLabelText('תדר (4 ספרות)');
    await user.clear(input);
    await user.type(input, '12ab');
    expect(input).toHaveValue('12');
    expect(screen.getByRole('button', { name: '✓' })).toBeDisabled();

    await user.type(input, '345{Enter}');
    expect(screen.getByTitle('לחיצה כפולה לשינוי תדר')).toHaveTextContent('1234');
  });

  it('shift commander can be changed', async () => {
    const { user } = setup();
    await user.dblClick(screen.getByTitle('לחיצה כפולה לשינוי משמרת ומפקד'));
    const commander = screen.getByLabelText('מפקד משמרת');
    await user.clear(commander);
    await user.type(commander, 'סנ"צ לוי{Enter}');
    expect(screen.getByTitle('לחיצה כפולה לשינוי משמרת ומפקד')).toHaveTextContent('מפקד: סנ"צ לוי');
  });
});

describe('forces and incidents', () => {
  it('rejects a duplicate call sign and carries a rename into incident assignments', async () => {
    const { user } = setup();
    await goTo(user, 'כוחות');
    await user.dblClick(screen.getByText('סיור 21', { exact: true }));
    const callSign = screen.getByLabelText(/אות קריאה/);
    await user.clear(callSign);
    await user.type(callSign, 'סיור 14');
    expect(screen.getByRole('button', { name: 'שמירה' })).toBeDisabled();

    await user.clear(callSign);
    await user.type(callSign, 'סיור 22{Enter}');
    await goTo(user, 'אירועים');
    expect(screen.getByText(/סיור 22, רחפן תרמי/)).toBeInTheDocument();
  });

  it('edits an incident tier and status', async () => {
    const { user } = setup();
    await goTo(user, 'אירועים');
    await user.dblClick(screen.getByText('דיווח על התקהלות'));
    await user.selectOptions(screen.getByLabelText('דרג'), '1');
    await user.click(screen.getByRole('button', { name: 'שמירה' }));
    expect(screen.getByText('דיווח על התקהלות').closest('li')).toHaveTextContent('דחוף - סכנת חיים');
  });
});

describe('agencies', () => {
  it('switching to phone requires a valid number', async () => {
    const { user } = setup();
    await goTo(user, 'גורמי חוץ');
    await user.dblClick(screen.getByText('כבאות והצלה'));
    await user.selectOptions(screen.getByLabelText('אמצעי קשר'), 'phone');
    const phone = screen.getByLabelText('מספר טלפון *');
    await user.type(phone, 'abc');
    expect(screen.getByRole('button', { name: 'שמירה' })).toBeDisabled();

    await user.clear(phone);
    await user.type(phone, '02-6250000{Enter}');
    expect(card('כבאות והצלה')).toHaveTextContent('02-6250000');
    expect(card('כבאות והצלה')).not.toHaveTextContent('2140');
  });
});

describe('browser persistence', () => {
  it('restores changes after a reload and the reset brings back the demo data', async () => {
    const first = setup();
    await first.user.dblClick(screen.getByText('החלפת כוחות וריענון'));
    const title = screen.getByLabelText('כותרת *');
    await first.user.clear(title);
    await first.user.type(title, 'נשמר בדפדפן{Enter}');
    first.unmount();

    const second = setup(); // "reload"
    expect(screen.getByText('נשמר בדפדפן')).toBeInTheDocument();

    await second.user.click(screen.getByRole('button', { name: /איפוס לנתוני הדגמה/ }));
    await second.user.click(screen.getByRole('button', { name: /לחץ שוב לאישור/ }));
    expect(screen.queryByText('נשמר בדפדפן')).not.toBeInTheDocument();
    expect(screen.getByText('החלפת כוחות וריענון')).toBeInTheDocument();
  });

  it('new incidents after a reload never reuse a saved id', async () => {
    const first = setup();
    await goTo(first.user, 'אירועים');
    await first.user.click(screen.getByRole('button', { name: /פתיחת אירוע/ }));
    await first.user.type(screen.getByPlaceholderText('כותרת האירוע *'), 'לפני רענון{Enter}');
    first.unmount();

    const second = setup();
    await goTo(second.user, 'אירועים');
    await second.user.click(screen.getByRole('button', { name: /פתיחת אירוע/ }));
    await second.user.type(screen.getByPlaceholderText('כותרת האירוע *'), 'אחרי רענון{Enter}');

    const ids = screen.getAllByText(/^INC-\d+$/).map((el) => el.textContent);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
