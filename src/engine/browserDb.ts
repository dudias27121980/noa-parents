import type { Db, SingletonKey } from './dbTypes';
import { COLLECTIONS, CollectionName, LOG_WINDOW, SharedState } from '../shared/protocol';
import { LogEntry } from '../types/tactical';

/** Everything the offline file keeps, as one JSON document - also the backup file format */
export interface OfflineDump {
  format: 'tactical-ops-offline';
  version: 1;
  savedAt: string;
  records: Partial<Record<CollectionName, { id: string }[]>>;
  singletons: Partial<Record<SingletonKey, unknown>>;
  /** Newest first */
  logs: LogEntry[];
  maxLogNumber: number;
}

export const STORAGE_KEY = 'tactical-ops:offline-db';
/** The browser's storage is small (about 5 MB); older log entries beyond this are dropped from the file */
export const MAX_STORED_LOGS = 5000;

const empty = (): OfflineDump => ({
  format: 'tactical-ops-offline',
  version: 1,
  savedAt: new Date().toISOString(),
  records: {},
  singletons: {},
  logs: [],
  maxLogNumber: 0,
});

export function isDump(v: unknown): v is OfflineDump {
  const d = v as OfflineDump;
  return (
    typeof d === 'object' &&
    d !== null &&
    d.format === 'tactical-ops-offline' &&
    d.version === 1 &&
    typeof d.records === 'object' &&
    typeof d.singletons === 'object' &&
    Array.isArray(d.logs) &&
    typeof d.maxLogNumber === 'number'
  );
}

const logNumber = (id: string) => (/^LOG-(\d+)$/.exec(id) ? Number(id.slice(4)) : 0);

/**
 * The core's storage, kept in the browser (localStorage) instead of SQLite.
 * Every change is written through at the end of its transaction. `onError` hears about a failed write
 * (storage full or blocked) - the data is then only in memory until a backup is exported.
 */
export function openBrowserDb(
  storage: Storage,
  onError: (err: unknown) => void = () => {},
  /** After every committed change (the automatic file save listens here) */
  onChange: () => void = () => {}
): Db & { dump(): OfflineDump; startedEmpty: boolean } {
  let data: OfflineDump = empty();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isDump(parsed)) data = parsed;
  } catch (err) {
    onError(err);
  }
  // Nothing stored in this browser yet (first use, or its data was wiped): the engine seeds demo data
  const startedEmpty = COLLECTIONS.every((c) => !data.records[c]?.length);

  let depth = 0;
  const persist = () => {
    if (depth > 0) return;
    data.savedAt = new Date().toISOString();
    if (data.logs.length > MAX_STORED_LOGS) data.logs = data.logs.slice(0, MAX_STORED_LOGS);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      onError(err);
    }
    onChange();
  };
  const write = (fn: () => void) => {
    depth++;
    try {
      fn();
    } finally {
      depth--;
    }
    persist();
  };
  const rows = (c: CollectionName) => (data.records[c] ??= []);

  return {
    isEmpty: () => COLLECTIONS.every((c) => !data.records[c]?.length),
    load() {
      if (COLLECTIONS.every((c) => !data.records[c]?.length)) return null;
      const state = Object.fromEntries(COLLECTIONS.map((c) => [c, structuredClone(data.records[c] ?? [])])) as unknown as SharedState;
      state.logs = structuredClone(data.logs.slice(0, LOG_WINDOW));
      state.alertLevel = data.singletons.alertLevel as SharedState['alertLevel'];
      state.mainFrequency = data.singletons.mainFrequency as SharedState['mainFrequency'];
      state.shift = data.singletons.shift as SharedState['shift'];
      state.hqName = data.singletons.hqName as SharedState['hqName'];
      return state;
    },
    upsert: (c, list) =>
      write(() => {
        const current = rows(c);
        for (const row of list) {
          const copy = structuredClone(row);
          const at = current.findIndex((r) => r.id === row.id);
          if (at >= 0) current[at] = copy;
          else current.push(copy);
        }
      }),
    remove: (c, ids) =>
      write(() => {
        data.records[c] = rows(c).filter((r) => !ids.includes(r.id));
      }),
    replaceCollection: (c, list) =>
      write(() => {
        data.records[c] = structuredClone(list);
      }),
    setSingleton: (key, value) =>
      write(() => {
        data.singletons[key] = structuredClone(value);
      }),
    getSingleton: <T,>(key: SingletonKey) => data.singletons[key] as T | undefined,
    appendLogs: (entries) =>
      write(() => {
        data.logs = [...structuredClone(entries), ...data.logs];
        data.maxLogNumber = Math.max(data.maxLogNumber, ...entries.map((e) => logNumber(e.id)));
      }),
    clearLogs: () =>
      write(() => {
        data.logs = [];
      }),
    maxLogNumber: () => data.maxLogNumber,
    transaction: write,
    close: () => {},
    dump: () => structuredClone(data),
    startedEmpty,
  };
}
