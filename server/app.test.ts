// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from './app';
import { ServerMessage } from '../src/shared/protocol';

type Running = { url: string; port: number; stop: () => Promise<void> };
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function start(dbPath?: string, trustProxy = false): Promise<Running & { dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'tactical-app-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(dir, 'dist', 'assets', 'app-abc.js'), 'console.log(1)');
  writeFileSync(join(dir, 'secret.txt'), 'top secret');
  const server = createServer({
    dbPath: dbPath ?? join(dir, 'db.sqlite'),
    accessCode: 'code-4321',
    staticDir: join(dir, 'dist'),
    tickMs: 0,
    trustProxy,
  });
  const port = await server.listen(0, '127.0.0.1');
  let stopped = false;
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      await server.close();
    }
  };
  cleanups.push(stop);
  return { url: `http://127.0.0.1:${port}`, port, stop, dir };
}

const login = (url: string, station: string, code: string) =>
  fetch(`${url}/api/login`, { method: 'POST', body: JSON.stringify({ station, code }), headers: { 'Content-Type': 'application/json' } });

/** A raw WebSocket client that records every message */
function connect(port: number, token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`);
  const messages: ServerMessage[] = [];
  const waiters: { pred: (m: ServerMessage) => boolean; ok: (m: ServerMessage) => void }[] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMessage;
    messages.push(m);
    waiters.filter((w) => w.pred(m)).forEach((w) => {
      waiters.splice(waiters.indexOf(w), 1);
      w.ok(m);
    });
  });
  const next = (pred: (m: ServerMessage) => boolean) =>
    new Promise<ServerMessage>((ok, bad) => {
      const found = messages.find(pred);
      if (found) return ok(found);
      waiters.push({ pred, ok });
      setTimeout(() => bad(new Error('timeout waiting for message')), 3000);
    });
  const closed = new Promise<number>((ok) => ws.on('close', (code) => ok(code)));
  cleanups.push(() => ws.terminate());
  return { ws, next, closed, messages };
}

const tokenFor = async (url: string, station: string) => ((await (await login(url, station, 'code-4321')).json()) as { token: string }).token;

/** Raw GET without URL normalization (fetch would collapse "../") */
const rawGet = (port: number, path: string) =>
  new Promise<{ status: number; body: string }>((ok) => {
    request({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => ok({ status: res.statusCode ?? 0, body }));
    }).end();
  });

describe('login', () => {
  it('accepts the access code and rejects a wrong one', async () => {
    const { url } = await start();
    const ok = await login(url, 'עמדה 1', 'code-4321');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ station: 'עמדה 1', token: expect.any(String) });

    const bad = await login(url, 'עמדה 1', 'wrong');
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'קוד גישה שגוי' });
  });

  it('requires a station name', async () => {
    const { url } = await start();
    expect((await login(url, '  ', 'code-4321')).status).toBe(401);
  });

  it('locks out an address after repeated wrong codes', async () => {
    const { url } = await start();
    for (let i = 0; i < 5; i++) await login(url, 'x', 'wrong');
    const locked = await login(url, 'x', 'code-4321'); // even the right code, during the lockout
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('behind a trusted proxy, one station’s wrong codes do not lock out the others', async () => {
    const { url } = await start(undefined, true);
    const from = (ip: string, code: string) =>
      fetch(`${url}/api/login`, { method: 'POST', body: JSON.stringify({ station: 'x', code }), headers: { 'X-Forwarded-For': ip } });
    for (let i = 0; i < 5; i++) await from('10.0.0.1', 'wrong');
    expect((await from('10.0.0.1', 'code-4321')).status).toBe(429);
    expect((await from('10.0.0.2', 'code-4321')).status).toBe(200);
  });

  it('ignores X-Forwarded-For unless the proxy is trusted (it could be forged)', async () => {
    const { url } = await start();
    const from = (ip: string, code: string) =>
      fetch(`${url}/api/login`, { method: 'POST', body: JSON.stringify({ station: 'x', code }), headers: { 'X-Forwarded-For': ip } });
    for (let i = 0; i < 5; i++) await from(`10.0.0.${i}`, 'wrong'); // rotating a fake header doesn't dodge the lockout
    expect((await from('10.9.9.9', 'code-4321')).status).toBe(429);
  });

  it('rejects oversized or malformed bodies', async () => {
    const { url } = await start();
    const huge = await fetch(`${url}/api/login`, { method: 'POST', body: 'x'.repeat(10_000) }).catch(() => null);
    expect(huge === null || huge.status >= 400).toBe(true);
    expect((await fetch(`${url}/api/login`, { method: 'POST', body: '{nope' })).status).toBe(400);
  });
});

describe('live sync over WebSocket', () => {
  it('refuses a missing or forged token with the "log in again" code', async () => {
    const { port } = await start();
    expect(await connect(port, 'forged.token').closed).toBe(4001);
  });

  it('sends a snapshot, then broadcasts one station’s change to the others', async () => {
    const { url, port } = await start();
    const a = connect(port, await tokenFor(url, 'עמדה א'));
    const b = connect(port, await tokenFor(url, 'עמדה ב'));
    const snap = await a.next((m) => m.t === 'snapshot');
    expect(snap.t === 'snapshot' && snap.you).toBe('עמדה א');
    await b.next((m) => m.t === 'snapshot');
    await a.next((m) => m.t === 'presence' && m.stations.length === 2);

    a.ws.send(JSON.stringify({ t: 'action', reqId: 1, action: { type: 'frequency.set', frequency: '2750' } }));
    const patch = await b.next((m) => m.t === 'patch');
    expect(patch.t === 'patch' && patch.patch.set?.mainFrequency).toBe('2750');
    const result = await a.next((m) => m.t === 'result');
    expect(result.t === 'result' && result.result).toEqual({ ok: true });
  });

  it('ignores malformed messages without dropping the connection', async () => {
    const { url, port } = await start();
    const a = connect(port, await tokenFor(url, 'עמדה א'));
    await a.next((m) => m.t === 'snapshot');
    a.ws.send('not json');
    a.ws.send(JSON.stringify({ t: 'action', reqId: 'x' }));
    a.ws.send(JSON.stringify({ t: 'action', reqId: 2, action: { type: 'frequency.set', frequency: '1111' } }));
    const r = await a.next((m) => m.t === 'result');
    expect(r.t === 'result' && r.reqId).toBe(2);
  });

  it('keeps data and logins valid across a server restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tactical-restart-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const dbPath = join(dir, 'db.sqlite');

    const first = await start(dbPath);
    const token = await tokenFor(first.url, 'עמדה א');
    const a = connect(first.port, token);
    await a.next((m) => m.t === 'snapshot');
    a.ws.send(JSON.stringify({ t: 'action', reqId: 1, action: { type: 'frequency.set', frequency: '6060' } }));
    await a.next((m) => m.t === 'result');
    await first.stop();

    const second = await start(dbPath);
    const again = connect(second.port, token); // same token, new server process
    const snap = await again.next((m) => m.t === 'snapshot');
    expect(snap.t === 'snapshot' && snap.state.mainFrequency).toBe('6060');
  });
});

describe('static files', () => {
  it('serves the app with security headers and falls back to index.html', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/some/client/route`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect((await fetch(`${url}/assets/app-abc.js`)).headers.get('cache-control')).toContain('immutable');
  });

  it('never serves files outside the build directory', async () => {
    const { port } = await start();
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const res = await rawGet(port, path);
      expect(res.body, path).not.toContain('top secret');
    }
  });
});
