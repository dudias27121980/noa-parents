// The station's login (token + name). Kept in this browser only; the server can refuse it at any time.
const KEY = 'tactical-ops:session';
const LAST_STATION = 'tactical-ops:last-station';

export interface Session {
  token: string;
  station: string;
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

export async function login(station: string, code: string): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station, code }),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string; station?: string; error?: string };
    if (res.ok && body.token && body.station) return { ok: true, session: { token: body.token, station: body.station } };
    return { ok: false, error: body.error ?? 'הכניסה נכשלה' };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת' };
  }
}
