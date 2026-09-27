import { OfflineDump, isDump } from './browserDb';

/**
 * Automatic save to a file the HQ chose on disk (File System Access API, Chrome / Edge).
 * Browser storage can be wiped (clearing browsing data, another browser, a new computer);
 * the file cannot. Every change is written to it within a second.
 *
 * The chosen file is remembered between openings (IndexedDB). After reopening, the browser
 * asks once for permission again, which has to come from a click.
 */

export type SaveState =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'needs-permission'; fileName: string }
  | { kind: 'saved'; fileName: string; at: Date | null }
  | { kind: 'error'; fileName: string; message: string };

/** The parts of a FileSystemFileHandle used here (tests pass fakes) */
export interface SaveFileHandle {
  name: string;
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<{ text(): Promise<string> }>;
}

/** Where the chosen file is remembered */
export interface HandleStore {
  get(): Promise<SaveFileHandle | undefined>;
  set(h: SaveFileHandle): Promise<void>;
  clear(): Promise<void>;
}

export interface Pickers {
  save(): Promise<SaveFileHandle>;
  open(): Promise<SaveFileHandle>;
}

export const SAVE_DEBOUNCE_MS = 800;

/** Same data, whenever it was saved */
export const sameData = (a: OfflineDump, b: OfflineDump) => JSON.stringify({ ...a, savedAt: '' }) === JSON.stringify({ ...b, savedAt: '' });

/** How a remembered file is matched against this browser's data before anything is written to it */
export interface Reconcile {
  /** This browser had no data of its own when the page opened (first use, or wiped) */
  localIsFresh: boolean;
  /** Replace this browser's data with the file's (reloads the page) */
  restore(d: OfflineDump): void;
  /** Ask the HQ (true = load from the file) */
  confirm(text: string): boolean;
}
const FILE_TYPES = [{ description: 'נתוני חפ"ק', accept: { 'application/json': ['.json'] } }];

export class AutoSaver {
  private state: SaveState;
  private handle: SaveFileHandle | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private again = false;
  private listeners = new Set<() => void>();

  private reconciling = false;

  constructor(
    private dump: () => OfflineDump,
    private handles: HandleStore | null,
    private pickers: Pickers | null,
    private reconcile: Reconcile | null = null
  ) {
    this.state = handles && pickers ? { kind: 'off' } : { kind: 'unsupported' };
  }

  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  private set(s: SaveState) {
    this.state = s;
    this.listeners.forEach((l) => l());
  }

  /** On opening: pick up the file chosen last time */
  async resume() {
    if (!this.handles) return;
    const h = await this.handles.get().catch(() => undefined);
    if (!h) return;
    this.handle = h;
    if ((await h.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') await this.reconcileThenWrite();
    else this.set({ kind: 'needs-permission', fileName: h.name });
  }

  /** After reopening: the permission prompt (must run from a click) */
  async grant() {
    if (!this.handle) return;
    const p = await this.handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied' as PermissionState);
    if (p === 'granted') await this.reconcileThenWrite();
    else this.set({ kind: 'needs-permission', fileName: this.handle.name });
  }

  /**
   * Before writing to a remembered file, read it: never overwrite saved data with a browser that
   * lost its own. Wiped browser → the file's data comes back. Newer file (e.g. saved from another
   * computer) → ask. Otherwise this browser's data is written as usual.
   */
  private async reconcileThenWrite() {
    const h = this.handle;
    if (!h) return;
    this.reconciling = true;
    try {
      let saved: unknown = null;
      try {
        const text = await (await h.getFile()).text();
        saved = text.trim() ? JSON.parse(text) : null;
      } catch {
        saved = null; // unreadable: this browser's data is written over it below
      }
      if (this.reconcile && isDump(saved) && !sameData(saved, this.dump())) {
        if (this.reconcile.localIsFresh) {
          this.reconcile.restore(saved);
          return;
        }
        if (
          saved.savedAt > this.dump().savedAt &&
          this.reconcile.confirm(
            `בקובץ השמירה ${h.name} יש נתונים חדשים יותר (נשמרו ${new Date(saved.savedAt).toLocaleString('he-IL')}).\n` +
              'אישור: לטעון אותם. ביטול: להמשיך עם הנתונים שבדפדפן הזה ולשמור אותם לקובץ.'
          )
        ) {
          this.reconcile.restore(saved);
          return;
        }
      }
    } finally {
      this.reconciling = false;
    }
    await this.writeNow();
  }

  /** A new save file: everything is written to it now, and on every change */
  async chooseNewFile() {
    if (!this.pickers || !this.handles) return;
    let h: SaveFileHandle;
    try {
      h = await this.pickers.save();
    } catch {
      return; // the dialog was cancelled
    }
    this.handle = h;
    await this.handles.set(h).catch(() => {});
    await this.writeNow();
  }

  /**
   * An existing save file: returns its data when it differs from what is open here (the caller
   * confirms and restores it); saving then continues into that file.
   */
  async openExistingFile(): Promise<{ dump: OfflineDump | null; error?: string } | null> {
    if (!this.pickers || !this.handles) return null;
    let h: SaveFileHandle;
    try {
      h = await this.pickers.open();
    } catch {
      return null;
    }
    let parsed: unknown = null;
    try {
      const text = await (await h.getFile()).text();
      parsed = text.trim() ? JSON.parse(text) : null;
    } catch {
      return { dump: null, error: 'הקובץ אינו קובץ שמירה של לוח השליטה' };
    }
    if (parsed !== null && !isDump(parsed)) return { dump: null, error: 'הקובץ אינו קובץ שמירה של לוח השליטה' };
    if ((await h.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) !== 'granted') {
      return { dump: null, error: 'הדפדפן לא אישר כתיבה לקובץ' };
    }
    this.handle = h;
    await this.handles.set(h).catch(() => {});
    return { dump: parsed };
  }

  /** Stop saving to the file (the file itself stays on disk) */
  async stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.handle = null;
    await this.handles?.clear().catch(() => {});
    this.set({ kind: 'off' });
  }

  /** Called on every change: writes shortly after the last one */
  schedule() {
    if (!this.handle || this.reconciling || this.state.kind === 'needs-permission' || this.state.kind === 'off') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.writeNow();
    }, SAVE_DEBOUNCE_MS);
  }

  async writeNow() {
    const h = this.handle;
    if (!h) return;
    // One write at a time; changes during a write are written right after it
    if (this.writing) {
      this.again = true;
      return;
    }
    this.writing = true;
    try {
      const w = await h.createWritable();
      await w.write(JSON.stringify(this.dump(), null, 1));
      await w.close();
      if (this.handle === h) this.set({ kind: 'saved', fileName: h.name, at: new Date() });
    } catch (err) {
      if (this.handle === h) {
        const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        this.set(
          denied
            ? { kind: 'needs-permission', fileName: h.name }
            : { kind: 'error', fileName: h.name, message: err instanceof Error ? err.message : String(err) }
        );
      }
    } finally {
      this.writing = false;
      if (this.again) {
        this.again = false;
        void this.writeNow();
      }
    }
  }
}

/* ---------- the browser's implementations ---------- */

type PickerWindow = Window & {
  showSaveFilePicker?: (opts: object) => Promise<SaveFileHandle>;
  showOpenFilePicker?: (opts: object) => Promise<SaveFileHandle[]>;
};

export function browserPickers(): Pickers | null {
  const w = window as PickerWindow;
  if (typeof w.showSaveFilePicker !== 'function' || typeof w.showOpenFilePicker !== 'function') return null;
  return {
    save: () => w.showSaveFilePicker!({ suggestedName: 'hq-data.json', types: FILE_TYPES }),
    open: async () => (await w.showOpenFilePicker!({ types: FILE_TYPES, multiple: false }))[0],
  };
}

/** The chosen file handle, kept in IndexedDB (localStorage cannot hold it) */
export function indexedDbHandleStore(): HandleStore | null {
  if (typeof indexedDB === 'undefined') return null;
  const KEY = 'autosave-file';
  const open = () =>
    new Promise<IDBDatabase>((ok, bad) => {
      const req = indexedDB.open('tactical-ops', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => bad(req.error);
    });
  const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
    open().then(
      (db) =>
        new Promise<T>((ok, bad) => {
          const req = fn(db.transaction('handles', mode).objectStore('handles'));
          req.onsuccess = () => ok(req.result);
          req.onerror = () => bad(req.error);
        })
    );
  return {
    get: () => run<SaveFileHandle | undefined>('readonly', (s) => s.get(KEY)),
    set: (h) => run('readwrite', (s) => s.put(h, KEY)).then(() => undefined),
    clear: () => run('readwrite', (s) => s.delete(KEY)).then(() => undefined),
  };
}

/** Asks the browser not to evict this page's storage when the disk runs low */
export function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => false);
}
