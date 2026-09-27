import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoSaver, HandleStore, Pickers, SAVE_DEBOUNCE_MS, SaveFileHandle } from './autoSave';
import { OfflineDump, openBrowserDb } from './browserDb';
import { SaveStatus } from '../components/SaveStatus';
import { memoryStorage } from '../test/memoryStorage';

/** A file on "disk": its text, the browser's permission for it, and a switch to make writes fail */
function fakeFile(name = 'hq-data.json', text = '') {
  const f = {
    name,
    text,
    permission: 'granted' as PermissionState,
    askAnswer: 'granted' as PermissionState,
    failWith: null as Error | null,
    writes: 0,
    queryPermission: vi.fn(async () => f.permission),
    requestPermission: vi.fn(async () => (f.permission = f.askAnswer)),
    createWritable: async () => {
      if (f.failWith) throw f.failWith;
      let buf = '';
      return {
        write: async (d: string) => void (buf += d),
        close: async () => {
          f.text = buf;
          f.writes++;
        },
      };
    },
    getFile: async () => ({ text: async () => f.text }),
  };
  return f satisfies SaveFileHandle;
}

const memoryHandles = (): HandleStore & { h?: SaveFileHandle } => {
  const s: HandleStore & { h?: SaveFileHandle } = {
    get: async () => s.h,
    set: async (h) => void (s.h = h),
    clear: async () => void (s.h = undefined),
  };
  return s;
};

const pickersFor = (save: SaveFileHandle, open: SaveFileHandle = save): Pickers => ({ save: async () => save, open: async () => open });

function setup() {
  const storage = memoryStorage();
  let saver: AutoSaver | undefined;
  const db = openBrowserDb(storage, undefined, () => saver?.schedule());
  db.setSingleton('hqName', 'חפ"ק בדיקה');
  return { db, make: (handles: HandleStore | null, pickers: Pickers | null) => (saver = new AutoSaver(db.dump, handles, pickers)) };
}

afterEach(() => vi.useRealTimers());

describe('automatic file save', () => {
  it('writes everything to the chosen file, then every change shortly after it happens', async () => {
    vi.useFakeTimers();
    const { db, make } = setup();
    const file = fakeFile();
    const handles = memoryHandles();
    const saver = make(handles, pickersFor(file));
    expect(saver.getState()).toEqual({ kind: 'off' });

    await saver.chooseNewFile();
    expect(saver.getState()).toMatchObject({ kind: 'saved', fileName: 'hq-data.json' });
    expect(JSON.parse(file.text).singletons.hqName).toBe('חפ"ק בדיקה');
    expect(handles.h).toBe(file); // remembered for next time

    // A burst of changes: one write, after the last one
    db.setSingleton('mainFrequency', '1111');
    db.setSingleton('mainFrequency', '2222');
    db.setSingleton('mainFrequency', '3333');
    expect(file.writes).toBe(1);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(file.writes).toBe(2);
    expect(JSON.parse(file.text).singletons.mainFrequency).toBe('3333');
  });

  it('after reopening: continues by itself when allowed, or asks for one click', async () => {
    const { make } = setup();
    const file = fakeFile();
    const handles = memoryHandles();
    handles.h = file;

    await make(handles, pickersFor(file)).resume();
    expect(file.writes).toBe(1);

    file.permission = 'prompt';
    const saver = make(handles, pickersFor(file));
    await saver.resume();
    expect(saver.getState()).toEqual({ kind: 'needs-permission', fileName: 'hq-data.json' });
    saver.schedule(); // no writes while waiting for the click
    await saver.grant();
    expect(file.requestPermission).toHaveBeenCalled();
    expect(saver.getState()).toMatchObject({ kind: 'saved' });
    expect(file.writes).toBe(2);
  });

  it('a wiped browser never overwrites the saved file: its data comes back from the file instead', async () => {
    const { db } = setup();
    const saved: OfflineDump = { ...db.dump(), singletons: { ...db.dump().singletons, hqName: 'הנתונים האמיתיים' } };
    const file = fakeFile('hq-data.json', JSON.stringify(saved));
    const handles = memoryHandles();
    handles.h = file;
    const restore = vi.fn();
    const saver = new AutoSaver(db.dump, handles, pickersFor(file), { localIsFresh: true, restore, confirm: () => false });
    await saver.resume();
    expect(restore).toHaveBeenCalledWith(saved);
    expect(file.writes).toBe(0);
    expect(JSON.parse(file.text).singletons.hqName).toBe('הנתונים האמיתיים');
  });

  it('a newer file (saved from another computer) is offered; an older one is updated from this browser', async () => {
    const { db } = setup();
    const newer: OfflineDump = { ...db.dump(), savedAt: '2999-01-01T00:00:00.000Z', singletons: { ...db.dump().singletons, hqName: 'ממחשב אחר' } };
    const older: OfflineDump = { ...newer, savedAt: '2000-01-01T00:00:00.000Z' };

    const file1 = fakeFile('a.json', JSON.stringify(newer));
    const h1 = memoryHandles();
    h1.h = file1;
    const restore = vi.fn();
    const confirm = vi.fn((_text: string) => true);
    await new AutoSaver(db.dump, h1, pickersFor(file1), { localIsFresh: false, restore, confirm }).resume();
    expect(confirm.mock.calls[0][0]).toMatch(/יש נתונים חדשים יותר/);
    expect(restore).toHaveBeenCalledWith(newer);
    expect(file1.writes).toBe(0);

    const file2 = fakeFile('b.json', JSON.stringify(older));
    const h2 = memoryHandles();
    h2.h = file2;
    const restore2 = vi.fn();
    await new AutoSaver(db.dump, h2, pickersFor(file2), { localIsFresh: false, restore: restore2, confirm: () => true }).resume();
    expect(restore2).not.toHaveBeenCalled();
    expect(JSON.parse(file2.text).singletons.hqName).toBe('חפ"ק בדיקה');
  });

  it('a failed write is shown, never silent; a refused permission asks again', async () => {
    const { make } = setup();
    const file = fakeFile();
    const saver = make(memoryHandles(), pickersFor(file));
    await saver.chooseNewFile();
    file.failWith = new Error('הדיסק מלא');
    await saver.writeNow();
    expect(saver.getState()).toEqual({ kind: 'error', fileName: 'hq-data.json', message: 'הדיסק מלא' });
    file.failWith = new DOMException('no', 'NotAllowedError');
    await saver.writeNow();
    expect(saver.getState().kind).toBe('needs-permission');
  });

  it('continuing from an existing file returns its data, or refuses a file that is not a save file', async () => {
    const { db, make } = setup();
    const theirs: OfflineDump = { ...db.dump(), singletons: { ...db.dump().singletons, hqName: 'מהקובץ' } };
    const existing = fakeFile('old.json', JSON.stringify(theirs));
    const saver = make(memoryHandles(), pickersFor(fakeFile(), existing));
    expect(await saver.openExistingFile()).toEqual({ dump: theirs });

    const junk = fakeFile('x.json', '{"a":1}');
    expect(await make(memoryHandles(), pickersFor(junk)).openExistingFile()).toEqual({
      dump: null,
      error: 'הקובץ אינו קובץ שמירה של לוח השליטה',
    });
  });

  it('without the browser feature it says so instead of pretending', () => {
    expect(setup().make(null, null).getState()).toEqual({ kind: 'unsupported' });
  });
});

describe('save status in the top bar', () => {
  it('amber until a file is chosen, green with the time after; continuing from a file restores its data after confirming', async () => {
    const { db, make } = setup();
    const file = fakeFile();
    const theirs: OfflineDump = { ...db.dump(), singletons: { ...db.dump().singletons, hqName: 'מהקובץ' } };
    const existing = fakeFile('old.json', JSON.stringify(theirs));
    const saver = make(memoryHandles(), pickersFor(file, existing));
    const restore = vi.fn();
    const confirm = vi.fn((_text: string) => true);
    render(<SaveStatus saver={saver} current={db.dump} restore={restore} confirm={confirm} notify={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /שמירה לקובץ כבויה/ }));
    await user.click(screen.getByRole('menuitem', { name: 'בחירת קובץ שמירה חדש…' }));
    expect(await screen.findByRole('button', { name: /נשמר \d\d:\d\d/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /נשמר/ }));
    await user.click(screen.getByRole('menuitem', { name: 'המשך מקובץ שמירה קיים…' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(theirs));
    expect(confirm.mock.calls[0][0]).toMatch(/הנתונים שפתוחים כרגע יוחלפו/);
  });
});
