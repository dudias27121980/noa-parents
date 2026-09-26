import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { CLOSE_UNAUTHORIZED } from '../src/shared/protocol';
import { openDb } from './db';
import { createCore } from './core';
import { createHub, Conn } from './hub';
import { createAuth } from './auth';

export interface ServerOptions {
  dbPath: string;
  accessCode: string;
  /** Built client to serve (production); omit in development where Vite serves it */
  staticDir?: string;
  /** Unit telemetry tick; 0 disables (tests) */
  tickMs?: number;
  heartbeatMs?: number;
  sessionSecret?: string;
  /**
   * Behind a reverse proxy (HTTPS termination) every request comes from the proxy's address, so the
   * login lockout would lock out all stations at once. When set, the client address is taken from
   * X-Forwarded-For — only enable it when a proxy you control sets that header.
   */
  trustProxy?: boolean;
  now?: () => Date;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:",
};

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage, limit = 4096) =>
  new Promise<string>((ok, bad) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        bad(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', bad);
  });

export function createServer(opts: ServerOptions) {
  const db = openDb(opts.dbPath);
  const core = createCore({ db, now: opts.now });
  const hub = createHub(core);

  // Tokens stay valid across restarts: the signing secret lives in the database unless one is provided
  let secret = opts.sessionSecret ?? db.getSingleton<string>('secret');
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    db.setSingleton('secret', secret);
  }
  const auth = createAuth({ accessCode: opts.accessCode, secret });

  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null;

  const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
    if (!staticRoot || !existsSync(staticRoot)) {
      res.writeHead(404, SECURITY_HEADERS).end('Not found');
      return;
    }
    const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = resolve(join(staticRoot, urlPath));
    // Never serve outside the build directory
    if (file !== staticRoot && !file.startsWith(staticRoot + sep)) {
      res.writeHead(403, SECURITY_HEADERS).end('Forbidden');
      return;
    }
    // Single-page app: unknown paths get index.html
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticRoot, 'index.html');
    const hashed = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(readFileSync(file));
  };

  const http = createHttpServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    try {
      if (path === '/api/health') return json(res, 200, { ok: true, stations: hub.stations() });
      if (path === '/api/login') {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
        let body: { station?: unknown; code?: unknown };
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return json(res, 400, { error: 'בקשה לא תקינה' });
        }
        const forwarded = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
        const result = auth.login(body.station, body.code, forwarded || req.socket.remoteAddress || 'unknown');
        if (result.ok) return json(res, 200, { token: result.token, station: result.station });
        if (result.retryAfterSec) return json(res, 429, { error: result.error }, { 'Retry-After': String(result.retryAfterSec) });
        return json(res, 401, { error: result.error });
      }
      if (path.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
      serveStatic(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'שגיאת שרת' });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const station = auth.verify(url.searchParams.get('token'));
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!station) {
        // Upgrade first, then close with a code the client understands ("log in again")
        ws.close(CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
      const conn: Conn = {
        station,
        send: (msg) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        },
      };
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
      ws.on('message', (data) => {
        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        try {
          hub.receive(conn, msg);
        } catch (err) {
          console.error('action failed', err);
        }
      });
      ws.on('close', () => hub.leave(conn));
      ws.on('error', () => hub.leave(conn));
      hub.join(conn);
    });
  });

  // Drop connections that stopped answering (laptop lid closed, network cut)
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!alive.get(ws)) return ws.terminate();
      alive.set(ws, false);
      ws.ping();
    });
  }, opts.heartbeatMs ?? 30_000);

  const ticker = opts.tickMs === 0 ? null : setInterval(() => hub.tick(), opts.tickMs ?? 3000);

  return {
    http,
    hub,
    core,
    listen(port: number, host = '0.0.0.0') {
      return new Promise<number>((ok) => http.listen(port, host, () => ok((http.address() as AddressInfo).port)));
    },
    close() {
      clearInterval(heartbeat);
      if (ticker) clearInterval(ticker);
      wss.clients.forEach((ws) => ws.terminate());
      return new Promise<void>((ok) =>
        http.close(() => {
          db.close();
          ok();
        })
      );
    },
  };
}
