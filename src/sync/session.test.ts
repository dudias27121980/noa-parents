import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_WAIT_MS, login } from './session';

const ok = () => new Response(JSON.stringify({ token: 't', station: 'עמדה 1', display: false }), { status: 200 });
const status = (code: number, body = '<html>starting</html>') => new Response(body, { status: code });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('login while the server wakes up', () => {
  it('retries network failures and proxy 502/503 until the server answers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(502))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const onWaiting = vi.fn();

    const pending = login('עמדה 1', '1948', false, { onWaiting });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ ok: true, session: { token: 't', station: 'עמדה 1', display: false } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onWaiting).toHaveBeenCalledTimes(3);
  });

  it('gives up with "no connection" once the wait is over', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const pending = login('עמדה 1', '1948');
    await vi.advanceTimersByTimeAsync(LOGIN_WAIT_MS + 10_000);

    await expect(pending).resolves.toEqual({ ok: false, error: 'אין חיבור לשרת - בדוק את הרשת ונסה שוב' });
    // Kept trying for the whole wait, not just once
    expect(fetchMock.mock.calls.length).toBeGreaterThan(10);
  });

  it('returns a real answer from the server (wrong code, lockout) at once, without retrying', async () => {
    for (const [code, error] of [
      [401, 'קוד גישה שגוי'],
      [429, 'יותר מדי ניסיונות'],
    ] as const) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status: code }));
      vi.stubGlobal('fetch', fetchMock);
      const onWaiting = vi.fn();
      await expect(login('עמדה 1', '0000', false, { onWaiting })).resolves.toEqual({ ok: false, error });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onWaiting).not.toHaveBeenCalled();
    }
  });
});
