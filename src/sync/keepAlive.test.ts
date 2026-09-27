import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { KEEP_ALIVE_MS, useKeepAlive } from './keepAlive';

afterEach(() => vi.useRealTimers());

describe('keep-alive', () => {
  it('pings the server well within Render\'s 15-minute idle limit, and stops when the page closes', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    expect(KEEP_ALIVE_MS).toBeLessThan(15 * 60 * 1000);

    const { unmount } = renderHook(() => useKeepAlive());
    vi.advanceTimersByTime(KEEP_ALIVE_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { cache: 'no-store' });

    unmount();
    vi.advanceTimersByTime(KEEP_ALIVE_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it('a failed ping (server asleep or offline) is not an error', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    renderHook(() => useKeepAlive());
    expect(() => vi.advanceTimersByTime(KEEP_ALIVE_MS)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
