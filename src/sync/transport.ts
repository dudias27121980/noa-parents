import { ClientMessage, ServerMessage } from '../shared/protocol';

export interface TransportHandlers {
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onClose(code: number): void;
}

export interface Transport {
  send(msg: ClientMessage): void;
  close(): void;
}

/** Opens one connection; the store calls it again to reconnect */
export type TransportFactory = (handlers: TransportHandlers) => Transport;

export const webSocketTransport =
  (token: string): TransportFactory =>
  (h) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      // The server waits for this before sending the snapshot
      ws.send(JSON.stringify({ t: 'hello' } satisfies ClientMessage));
      h.onOpen();
    };
    ws.onmessage = (e) => {
      try {
        h.onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (e) => h.onClose(e.code);
    return {
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: () => ws.close(1000),
    };
  };
