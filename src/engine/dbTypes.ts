// The storage interface the core runs on: SQLite on the server (db.ts), browser storage in the offline file.
// Kept free of Node imports so the core can be bundled for the browser.
import { LogEntry } from '../types/tactical';
import { CollectionName, SharedState, SingletonName } from '../shared/protocol';

/** Server-internal keys live next to the shared singletons */
export type SingletonKey = SingletonName | 'secret' | 'schemaVersion';

export interface Db {
  isEmpty(): boolean;
  load(): SharedState | null;
  upsert(collection: CollectionName, rows: { id: string }[]): void;
  remove(collection: CollectionName, ids: string[]): void;
  replaceCollection(collection: CollectionName, rows: { id: string }[]): void;
  setSingleton(key: SingletonKey, value: unknown): void;
  getSingleton<T>(key: SingletonKey): T | undefined;
  appendLogs(entries: LogEntry[]): void;
  clearLogs(): void;
  /** Every log id ever written — used to continue numbering after the visible window */
  maxLogNumber(): number;
  transaction(fn: () => void): void;
  close(): void;
}

