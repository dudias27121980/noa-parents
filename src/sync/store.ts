import {
  Action,
  ActionResult,
  CLOSE_UNAUTHORIZED,
  Notice,
  ServerMessage,
  SharedState,
  StationInfo,
  applyPatch,
} from '../shared/protocol';
import { Transport, TransportFactory } from './transport';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'unauthorized';

export interface StoreView {
  /** null until the first snapshot arrives */
  state: SharedState | null;
  status: ConnectionStatus;
  stations: StationInfo[];
  /** This station's name as the server knows it */
  you: string | null;
  /** Wall display: the server refuses every change from this connection */
  readOnly: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 10_000;

export const OFFLINE_ERROR = 'אין חיבור לשרת - השינוי לא נשמר';

/**
 * The station's live copy of the shared state. The server is the source of truth: actions are
 * sent to it, and the state only changes when the server's patch comes back (to every station).
 */
export class SharedStore {
  private view: StoreView = { state: null, status: 'connecting', stations: [], you: null, readOnly: false };
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  private transport: Transport | null = null;
  private pending = new Map<number, { resolve: (r: ActionResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private reqSeq = 0;
  private backoff = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private factory: TransportFactory) {}

  /* ---------- lifecycle ---------- */

  start() {
    if (this.running) return;
    this.running = true;
    this.open();
  }

  stop() {
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const t = this.transport;
    this.transport = null;
    t?.close();
    this.failPending();
  }

  private open() {
    this.update({ status: 'connecting' });
    const t = this.factory({
      onOpen: () => {
        /* wait for the snapshot before reporting online */
      },
      onMessage: (msg) => {
        if (this.transport === t) this.receive(msg);
      },
      onClose: (code) => {
        if (this.transport !== t) return; // an old connection we already replaced
        this.transport = null;
        this.failPending();
        if (code === CLOSE_UNAUTHORIZED) {
          this.refused();
          return;
        }
        this.update({ status: 'offline' });
        if (this.running) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (this.running) this.open();
          }, this.backoff);
          this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
        }
      },
    });
    this.transport = t;
  }

  private receive(msg: ServerMessage) {
    switch (msg.t) {
      case 'snapshot':
        this.backoff = 1000;
        this.update({ state: msg.state, stations: msg.stations, you: msg.you, readOnly: msg.readOnly, status: 'online' });
        break;
      case 'patch':
        if (this.view.state) this.update({ state: applyPatch(this.view.state, msg.patch) });
        break;
      case 'presence':
        this.update({ stations: msg.stations });
        break;
      case 'result': {
        const p = this.pending.get(msg.reqId);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.reqId);
          p.resolve(msg.result);
        }
        break;
      }
      case 'notice':
        this.noticeListeners.forEach((l) => l(msg.notice));
        break;
      case 'unauthorized':
        this.refused();
        break;
    }
  }

  /** The server refused this login (or it was found invalid elsewhere): stop, and ask to log in again */
  refused() {
    if (this.view.status === 'unauthorized') return;
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const t = this.transport;
    this.transport = null;
    t?.close();
    this.failPending();
    this.update({ status: 'unauthorized' });
  }

  private failPending() {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: OFFLINE_ERROR });
    });
    this.pending.clear();
  }

  /* ---------- actions ---------- */

  dispatch(action: Action): Promise<ActionResult> {
    if (this.view.status !== 'online' || !this.transport) return Promise.resolve({ ok: false, error: OFFLINE_ERROR });
    const reqId = ++this.reqSeq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        resolve({ ok: false, error: 'השרת לא הגיב - ייתכן שהשינוי לא נשמר' });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(reqId, { resolve, timer });
      this.transport!.send({ t: 'action', reqId, action });
    });
  }

  /* ---------- subscriptions (useSyncExternalStore) ---------- */

  getView = () => this.view;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onNotice(listener: (n: Notice) => void) {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  private update(partial: Partial<StoreView>) {
    this.view = { ...this.view, ...partial };
    this.listeners.forEach((l) => l());
  }
}
