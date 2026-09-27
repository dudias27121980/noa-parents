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
