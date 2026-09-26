import { Action, ServerMessage, StationInfo } from '../src/shared/protocol';
import { Core } from './core';

/** One open station connection (a WebSocket in production, an in-memory pipe in tests) */
export interface Conn {
  station: string;
  send(msg: ServerMessage): void;
}

/**
 * Connects stations to the core: gives each new connection a snapshot, runs their actions,
 * and broadcasts the resulting changes, presence and notices to every station.
 */
export function createHub(core: Core) {
  const conns = new Set<Conn>();

  const presence = (): StationInfo[] => {
    const counts = new Map<string, number>();
    conns.forEach((c) => counts.set(c.station, (counts.get(c.station) ?? 0) + 1));
    return [...counts].map(([name, connections]) => ({ name, connections })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  };

  const broadcast = (msg: ServerMessage, filter: (c: Conn) => boolean = () => true) =>
    conns.forEach((c) => {
      if (filter(c)) c.send(msg);
    });

  const snapshotFor = (c: Conn): ServerMessage => ({ t: 'snapshot', state: core.getState(), stations: presence(), you: c.station });

  return {
    join(conn: Conn) {
      conns.add(conn);
      conn.send(snapshotFor(conn));
      broadcast({ t: 'presence', stations: presence() }, (c) => c !== conn);
    },

    leave(conn: Conn) {
      if (!conns.delete(conn)) return;
      broadcast({ t: 'presence', stations: presence() });
    },

    /** A message from a station; anything malformed is ignored */
    receive(conn: Conn, msg: unknown) {
      if (typeof msg !== 'object' || msg === null) return;
      const { t, reqId, action } = msg as { t?: unknown; reqId?: unknown; action?: unknown };
      if (t !== 'action' || typeof reqId !== 'number') return;

      const outcome = core.dispatch(conn.station, action as Action);
      // Changes go out before the result, so the sender's state is current when its request resolves
      if (outcome.reset) conns.forEach((c) => c.send(snapshotFor(c)));
      else if (outcome.patch) broadcast({ t: 'patch', patch: outcome.patch });
      conn.send({ t: 'result', reqId, result: outcome.result });
      if (outcome.notice) {
        const notice = { ...outcome.notice, from: conn.station };
        // The acting station already knows; everyone else is alerted
        broadcast({ t: 'notice', notice }, (c) => c.station !== conn.station);
      }
    },

    tick() {
      const patch = core.tick();
      if (patch) broadcast({ t: 'patch', patch });
    },

    stations: presence,
  };
}

export type Hub = ReturnType<typeof createHub>;
