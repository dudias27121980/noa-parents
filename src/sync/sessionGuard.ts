import { checkSession } from './session';
import { SharedStore } from './store';

/**
 * Asks over plain HTTP whether the store's login is still valid - once now, and each time the live
 * connection drops - and refuses the store if it is not. A proxy can swallow the connection's own
 * "log in again" answer; without this a station with a stale login would retry forever.
 * Returns a function that stops watching.
 */
export function guardSession(store: SharedStore, token: string): () => void {
  let checking = false;
  let stopped = false;
  const verify = () => {
    if (checking || stopped) return;
    checking = true;
    void checkSession(token).then((r) => {
      checking = false;
      if (r === 'invalid' && !stopped) store.refused();
    });
  };
  let last = store.getView().status;
  const unsubscribe = store.subscribe(() => {
    const status = store.getView().status;
    if (status === 'offline' && last !== 'offline') verify();
    last = status;
  });
  verify();
  return () => {
    stopped = true;
    unsubscribe();
  };
}
