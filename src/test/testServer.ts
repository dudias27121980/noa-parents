import { openDb } from '../../server/db';
import { createCore } from '../../server/core';
import { createHub, Conn } from '../../server/hub';
import { TransportFactory, TransportHandlers } from '../sync/transport';

/**
 * The real server core + hub, in memory, with stations connected through an in-process pipe
 * instead of WebSockets. Messages are JSON round-tripped and delivered asynchronously, like the network.
 */
export function createTestServer(now?: () => Date) {
  const db = openDb(':memory:');
  const core = createCore({ db, now });
  const hub = createHub(core);
  const pipes = new Set<{ conn: Conn; h: TransportHandlers; open: boolean }>();
  let reachable = true;

  const wire = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

  const cut = (pipe: { conn: Conn; h: TransportHandlers; open: boolean }, code: number) => {
    if (!pipe.open) return;
    pipe.open = false;
    pipes.delete(pipe);
    hub.leave(pipe.conn);
    queueMicrotask(() => pipe.h.onClose(code));
  };

  const connect =
    (station: string, { readOnly = false } = {}): TransportFactory =>
    (h) => {
      const pipe = {
        h,
        open: true,
        conn: {
          station,
          readOnly,
          send: (msg) => {
            const copy = wire(msg);
            queueMicrotask(() => pipe.open && h.onMessage(copy));
          },
        } as Conn,
      };
      queueMicrotask(() => {
        if (!pipe.open) return;
        if (!reachable) return cut(pipe, 1006);
        pipes.add(pipe);
        h.onOpen();
        hub.join(pipe.conn);
      });
      return {
        send: (msg) => {
          const copy = wire(msg);
          queueMicrotask(() => pipe.open && hub.receive(pipe.conn, copy));
        },
        close: () => cut(pipe, 1000),
      };
    };

  return {
    core,
    hub,
    connect,
    /** Simulates a network outage: drops every station and refuses new connections */
    setReachable(on: boolean) {
      reachable = on;
      if (!on) [...pipes].forEach((p) => cut(p, 1006));
    },
    close: () => db.close(),
  };
}

export type TestServer = ReturnType<typeof createTestServer>;
