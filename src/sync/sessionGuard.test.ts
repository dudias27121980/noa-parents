import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedStore } from './store';
import { TransportFactory } from './transport';
import { guardSession } from './sessionGuard';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A live connection that opens and then drops without ever answering, as through the broken proxy */
const silentlyDropping: TransportFactory = (h) => {
  setTimeout(() => h.onClose(1006), 10);
  return { send: () => {}, close: () => {} };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('session guard', () => {
  it('a stale login that the live connection never refuses is caught over HTTP, and the retrying stops', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })));
    vi.stubGlobal('fetch', fetchMock);
    const store = new SharedStore(silentlyDropping);
    store.start();
    const stop = guardSession(store, 'old-token');
    await vi.advanceTimersByTimeAsync(50);

    expect(fetchMock).toHaveBeenCalledWith('/api/session', { headers: { Authorization: 'Bearer old-token' }, cache: 'no-store' });
    expect(store.getView().status).toBe('unauthorized');
    // No more reconnect attempts
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.getView().status).toBe('unauthorized');
    expect(fetchMock.mock.calls.length).toBe(calls);
    stop();
    store.stop();
  });

  it('a valid login keeps reconnecting, and is re-checked on every drop', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const store = new SharedStore(silentlyDropping);
    store.start();
    const stop = guardSession(store, 't');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getView().status).not.toBe('unauthorized');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    stop();
    store.stop();
  });

  it('an unreachable server is not taken as a bad login', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const store = new SharedStore(silentlyDropping);
    store.start();
    const stop = guardSession(store, 't');
    await flush();
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getView().status).not.toBe('unauthorized');
    stop();
    store.stop();
  });

  it('the "unauthorized" message from the server logs out even if the close code is lost', () => {
    let handlers!: Parameters<TransportFactory>[0];
    const store = new SharedStore((h) => {
      handlers = h;
      return { send: () => {}, close: () => {} };
    });
    store.start();
    handlers.onMessage({ t: 'unauthorized' });
    expect(store.getView().status).toBe('unauthorized');
    store.stop();
  });
});
