import { createCore } from './core';
import { createHub, Conn } from './hub';
import type { Db } from './dbTypes';
import { TransportFactory } from '../sync/transport';

/** The station name the offline file acts under (shown in the log next to every change) */
export const OFFLINE_STATION = 'עמדה מקומית';

/**
 * The engine (core and hub), running inside the page: the app talks to it through an in-process
 * pipe, so the dashboard works with no network at all.
 * tickMs: the demo telemetry that nudges moving units and drones at random. Off by default: on the
 * real sector map a force must stay where it was placed.
 */
export function createLocalServer(db: Db, { tickMs = 0 }: { tickMs?: number } = {}) {
  const core = createCore({ db });
  const hub = createHub(core);
  const ticker = tickMs > 0 ? setInterval(() => hub.tick(), tickMs) : null;
  // Messages are copied, as over the network, so the UI can never mutate the server's state
  const copy = <T,>(v: T): T => structuredClone(v);

  const transport: TransportFactory = (h) => {
    let open = true;
    const conn: Conn = {
      station: OFFLINE_STATION,
      readOnly: false,
      send: (msg) => {
        const m = copy(msg);
        queueMicrotask(() => open && h.onMessage(m));
      },
    };
    queueMicrotask(() => {
      if (!open) return;
      h.onOpen();
      hub.join(conn);
    });
    return {
      send: (msg) => {
        const m = copy(msg);
        queueMicrotask(() => open && hub.receive(conn, m));
      },
      close: () => {
        if (!open) return;
        open = false;
        hub.leave(conn);
        queueMicrotask(() => h.onClose(1000));
      },
    };
  };

  return {
    core,
    transport,
    stop: () => {
      if (ticker) clearInterval(ticker);
    },
  };
}
