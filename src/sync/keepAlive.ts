import { useEffect } from 'react';

/** Render's free plan puts a web service to sleep after 15 minutes without incoming HTTP requests */
export const KEEP_ALIVE_MS = 5 * 60 * 1000;

/**
 * While this page is open it sends the server a tiny request every few minutes, so a screen left
 * open on the wall keeps a sleep-on-idle host awake. Harmless on the command-post server.
 * Failures are ignored: the live connection already shows and handles being offline.
 */
export function useKeepAlive(intervalMs = KEEP_ALIVE_MS) {
  useEffect(() => {
    const ping = () => void fetch('/api/health', { cache: 'no-store' }).catch(() => {});
    const timer = setInterval(ping, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
