// The station's login (token + name). Kept in this browser only; the server can refuse it at any time.
const KEY = 'tactical-ops:session';
const LAST_STATION = 'tactical-ops:last-station';

export interface Session {
  token: string;
  station: string;
  /** Read-only wall display (long-lived login) */
  display?: boolean;
}

export const loadSession = (): Session | null => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
    return s && typeof s.token === 'string' && typeof s.station === 'string' ? s : null;
  } catch {
    return null;
  }
};

export const saveSession = (s: Session) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(LAST_STATION, s.station);
  } catch {
    /* works for this page load even if storage is blocked */
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

export const lastStationName = () => {
  try {
    return localStorage.getItem(LAST_STATION) ?? '';
  } catch {
    return '';
  }
};

/** How long a login keeps retrying while the server is unreachable (a sleeping host takes up to a minute to wake) */
export const LOGIN_WAIT_MS = 90_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 3_000, 5_000];
// The hosting proxy answers these while the server is starting; the request never reached the app
const WAKING_STATUSES = new Set([502, 503, 504]);

type LoginResult = { ok: true; session: Session } | { ok: false; error: string };

/**
 * Logs in, waiting out a server that is asleep or restarting: network failures and proxy 502/503/504
 * are retried (onWaiting is called before each retry) until LOGIN_WAIT_MS has passed.
 * A real answer from the server - wrong code, lockout - is returned at once.
 */
export async function login(
  station: string,
  code: string,
  display = false,
  { onWaiting, waitMs = LOGIN_WAIT_MS }: { onWaiting?: () => void; waitMs?: number } = {}
): Promise<LoginResult> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const result = await tryLogin(station, code, display);
    if (result !== 'unreachable') return result;
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    if (Date.now() - started + delay > waitMs) {
      return { ok: false, error: 'אין חיבור לשרת - בדוק את הרשת ונסה שוב' };
    }
    onWaiting?.();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function tryLogin(station: string, code: string, display: boolean): Promise<LoginResult | 'unreachable'> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station, code, display }),
    });
  } catch {
    return 'unreachable';
  }
  if (WAKING_STATUSES.has(res.status)) return 'unreachable';
  const body = (await res.json().catch(() => ({}))) as { token?: string; station?: string; display?: boolean; error?: string };
  if (res.ok && body.token && body.station) {
    return { ok: true, session: { token: body.token, station: body.station, display: body.display === true } };
  }
  return { ok: false, error: body.error ?? 'הכניסה נכשלה' };
}
