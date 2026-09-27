// Loaded at runtime rather than imported: the UI tests run this module inside a browser-like (jsdom)
// bundle, which refuses static imports of Node built-ins
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
import { COLLECTIONS, CollectionName, LOG_WINDOW, SharedState } from '../src/shared/protocol';

/**
 * SQLite persistence (Node's built-in node:sqlite — no native build step).
 * - records:    one row per milestone / incident / unit / agency (JSON)
 * - singletons: alert level, main frequency, shift, server secret
 * - logs:       append-only operations log; the full history is kept (stations see the newest LOG_WINDOW)
 */
export type { Db, SingletonKey } from './dbTypes';
import type { Db } from './dbTypes';

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS singletons (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS logs (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, data TEXT NOT NULL);
  `);

  const upsertStmt = db.prepare(
    'INSERT INTO records (collection, id, data) VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data'
  );
  const removeStmt = db.prepare('DELETE FROM records WHERE collection = ? AND id = ?');
  const clearCollectionStmt = db.prepare('DELETE FROM records WHERE collection = ?');
  const setSingletonStmt = db.prepare(
    'INSERT INTO singletons (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const getSingletonStmt = db.prepare('SELECT value FROM singletons WHERE key = ?');
  const appendLogStmt = db.prepare('INSERT INTO logs (id, data) VALUES (?, ?)');

  let depth = 0;
  const transaction = (fn: () => void) => {
    // Nested calls join the outer transaction
    if (depth > 0) return fn();
    depth++;
    db.exec('BEGIN');
    try {
      fn();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      depth--;
    }
  };

  const getSingleton = <T,>(key: string): T | undefined => {
    const row = getSingletonStmt.get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  };

  return {
    isEmpty: () => (db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n === 0,

    load() {
      const rows = db.prepare('SELECT collection, data FROM records ORDER BY rowid').all() as {
        collection: CollectionName;
        data: string;
      }[];
      if (rows.length === 0) return null;
      const state = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as SharedState;
      // Rows of a collection that no longer exists (e.g. the LPR alerts before schema 3) are left alone
      for (const row of rows) (state[row.collection] as unknown[] | undefined)?.push(JSON.parse(row.data));
      state.logs = (
        db.prepare('SELECT data FROM logs ORDER BY seq DESC LIMIT ?').all(LOG_WINDOW) as { data: string }[]
      ).map((r) => JSON.parse(r.data));
      state.alertLevel = getSingleton('alertLevel')!;
      state.mainFrequency = getSingleton('mainFrequency')!;
      state.shift = getSingleton('shift')!;
      // Added in schema 2; the core fills it in for older databases
      state.hqName = getSingleton('hqName')!;
      return state;
    },

    upsert(collection, rows) {
      transaction(() => rows.forEach((row) => upsertStmt.run(collection, row.id, JSON.stringify(row))));
    },
    remove(collection, ids) {
      transaction(() => ids.forEach((id) => removeStmt.run(collection, id)));
    },
    replaceCollection(collection, rows) {
      transaction(() => {
        clearCollectionStmt.run(collection);
        rows.forEach((row) => upsertStmt.run(collection, row.id, JSON.stringify(row)));
      });
    },
    setSingleton: (key, value) => void setSingletonStmt.run(key, JSON.stringify(value)),
    getSingleton,
    appendLogs(entries) {
      // Stored oldest first so seq order == time order
      transaction(() => [...entries].reverse().forEach((e) => appendLogStmt.run(e.id, JSON.stringify(e))));
    },
    clearLogs: () => void db.exec('DELETE FROM logs'),
    maxLogNumber() {
      const row = db
        .prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n FROM logs WHERE id LIKE 'LOG-%'")
        .get() as { n: number | null };
      return row.n ?? 0;
    },
    transaction,
    close: () => db.close(),
  };
}
