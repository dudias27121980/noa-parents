import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MAX_STORED_LOGS, STORAGE_KEY, openBrowserDb } from './browserDb';
import { OFFLINE_STATION, createLocalServer } from './localServer';
import { BackupButtons, backupFileName } from './BackupButtons';
import { SharedStore } from '../sync/store';
import { LogEntry } from '../types/tactical';

/** A fresh in-memory stand-in for the browser's localStorage */
function memoryStorage(): Storage & { failWrites: boolean } {
  const m = new Map<string, string>();
  return {
    failWrites: false,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem(k, v) {
      if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    },
  };
}

const stores: SharedStore[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stores.splice(0).forEach((s) => s.stop());
  stops.splice(0).forEach((s) => s());
});

/** Opens "the file": a local server on this storage and a store connected to it */
async function open(storage: Storage) {
  const db = openBrowserDb(storage);
  const server = createLocalServer(db, { tickMs: 0 });
  stops.push(server.stop);
  const store = new SharedStore(server.transport);
  stores.push(store);
  store.start();
  await waitFor(() => expect(store.getView().status).toBe('online'));
  return { db, server, store };
}

describe('offline file', () => {
  it('runs the real server logic in the page, and every change survives closing and reopening', async () => {
    const storage = memoryStorage();
    const first = await open(storage);
    expect(first.store.getView().you).toBe(OFFLINE_STATION);
    const res = await first.store.dispatch({ type: 'incident.add', incident: { title: 'אירוע בדיקה' } });
    expect(res.ok).toBe(true);
    await first.store.dispatch({ type: 'frequency.set', frequency: '4321' });
    first.store.stop();

    const again = await open(storage);
    const state = again.store.getView().state!;
    expect(state.incidents.some((i) => i.title === 'אירוע בדיקה')).toBe(true);
    expect(state.mainFrequency).toBe('4321');
    expect(state.logs[0].station).toBe(OFFLINE_STATION);
    // Written as one document under one key
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).format).toBe('tactical-ops-offline');
  });

  it('keeps numbering the log after reopening (no reused ids)', async () => {
    const storage = memoryStorage();
    const a = await open(storage);
    await a.store.dispatch({ type: 'frequency.set', frequency: '1111' });
    const lastId = a.store.getView().state!.logs[0].id;
    a.store.stop();
    const b = await open(storage);
    await b.store.dispatch({ type: 'frequency.set', frequency: '2222' });
    const newId = b.store.getView().state!.logs[0].id;
    expect(Number(newId.slice(4))).toBeGreaterThan(Number(lastId.slice(4)));
  });

  it('reports a failed write (storage full) instead of losing changes silently', () => {
    const storage = memoryStorage();
    const onError = vi.fn();
    const db = openBrowserDb(storage, onError);
    storage.failWrites = true;
    db.setSingleton('mainFrequency', '9999');
    expect(onError).toHaveBeenCalledTimes(1);
    // Still readable from memory until a backup is exported
    expect(db.getSingleton('mainFrequency')).toBe('9999');
  });

  it('writes a whole transaction once, and caps the stored log', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const db = openBrowserDb(storage);
    db.transaction(() => {
      db.setSingleton('mainFrequency', '1');
      db.setSingleton('shift', { commanderName: 'x', shiftName: 'y' });
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    const entry = (n: number): LogEntry => ({ id: `LOG-${n}`, date: '2026-09-27', timestamp: '00:00:00', severity: 'NOMINAL', source: 'בדיקה', action: String(n) });
    db.appendLogs(Array.from({ length: MAX_STORED_LOGS + 10 }, (_, i) => entry(MAX_STORED_LOGS + 10 - i)));
    expect(db.dump().logs).toHaveLength(MAX_STORED_LOGS);
    expect(db.dump().logs[0].id).toBe(`LOG-${MAX_STORED_LOGS + 10}`);
    expect(db.maxLogNumber()).toBe(MAX_STORED_LOGS + 10);
  });

  it('a corrupt storage entry starts fresh instead of breaking the page', async () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    const { store } = await open(storage);
    expect(store.getView().state!.milestones.length).toBeGreaterThan(0);
  });
});

describe('backup', () => {
  const file = (text: string) => new File([text], 'b.json', { type: 'application/json' });

  it('restores a valid backup after confirmation, and refuses anything else', async () => {
    const storage = memoryStorage();
    const { db } = await open(storage);
    const restore = vi.fn();
    const notify = vi.fn();
    const confirm = vi.fn(() => true);
    render(<BackupButtons dump={db.dump} restore={restore} confirm={confirm} notify={notify} />);
    const input = screen.getByTestId('backup-file');

    fireEvent.change(input, { target: { files: [file('{"x":1}')] } });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('הקובץ אינו גיבוי של לוח השליטה'));
    fireEvent.change(input, { target: { files: [file('not json')] } });
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    expect(restore).not.toHaveBeenCalled();

    const dump = db.dump();
    fireEvent.change(input, { target: { files: [file(JSON.stringify(dump))] } });
    await waitFor(() => expect(restore).toHaveBeenCalledWith(dump));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the restore is not confirmed', async () => {
    const { db } = await open(memoryStorage());
    const restore = vi.fn();
    render(<BackupButtons dump={db.dump} restore={restore} confirm={() => false} notify={vi.fn()} />);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [file(JSON.stringify(db.dump()))] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(restore).not.toHaveBeenCalled();
  });

  it('names the backup file in Latin letters with the date and time', () => {
    expect(backupFileName(new Date(2026, 8, 7, 5, 3))).toBe('hq-backup-2026-09-07-0503.json');
  });
});
