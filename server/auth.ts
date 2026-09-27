import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // one shift
// A wall display is read-only and left running unattended, so it stays logged in much longer
const DISPLAY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 'station' works the picture; 'display' only shows it (wall screen) — enforced by the server */
export type Role = 'station' | 'display';
export interface Identity {
  station: string;
  role: Role;
}
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;

export type LoginResult =
  | { ok: true; token: string; station: string; role: Role }
  | { ok: false; error: string; retryAfterSec?: number };

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const sha256 = (s: string) => createHash('sha256').update(s).digest();

/**
 * Station login: a shared access code + a station name, exchanged for a signed token.
 * Failed attempts are rate-limited per client address.
 */
export function createAuth({
  accessCode,
  secret,
  now = () => Date.now(),
}: {
  accessCode: string;
  secret: string;
  now?: () => number;
}) {
  const failures = new Map<string, { count: number; first: number; lockedUntil: number }>();

  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

  // Equal-length digests, so the comparison takes the same time whatever was typed
  const codeMatches = (code: string) => timingSafeEqual(sha256(code), sha256(accessCode));

  return {
    login(stationRaw: unknown, code: unknown, client: string, role: Role = 'station'): LoginResult {
      const t = now();
      const record = failures.get(client);
      if (record && record.lockedUntil > t) {
        return { ok: false, error: 'יותר מדי ניסיונות שגויים - נסה שוב בעוד דקה', retryAfterSec: Math.ceil((record.lockedUntil - t) / 1000) };
      }

      const station = typeof stationRaw === 'string' ? stationRaw.trim() : '';
      if (!station || station.length > 30) return { ok: false, error: 'יש להזין שם עמדה (עד 30 תווים)' };

      if (typeof code !== 'string' || !codeMatches(code)) {
        const r = record && t - record.first < FAILURE_WINDOW_MS ? record : { count: 0, first: t, lockedUntil: 0 };
        r.count++;
        if (r.count >= MAX_FAILURES) {
          r.lockedUntil = t + LOCKOUT_MS;
          r.count = 0;
          r.first = t;
        }
        failures.set(client, r);
        return { ok: false, error: 'קוד גישה שגוי' };
      }

      failures.delete(client);
      const ttl = role === 'display' ? DISPLAY_TTL_MS : TOKEN_TTL_MS;
      const payload = b64url(JSON.stringify({ s: station, r: role, exp: t + ttl }));
      return { ok: true, token: `${payload}.${sign(payload)}`, station, role };
    },

    /** Who a valid, unexpired token belongs to; null otherwise */
    verify(token: unknown): Identity | null {
      if (typeof token !== 'string') return null;
      const [payload, sig] = token.split('.');
      if (!payload || !sig) return null;
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      try {
        const { s, r, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { s: unknown; r?: unknown; exp: unknown };
        if (typeof s !== 'string' || typeof exp !== 'number' || exp <= now()) return null;
        // Tokens issued before roles existed are regular stations
        return { station: s, role: r === 'display' ? 'display' : 'station' };
      } catch {
        return null;
      }
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
