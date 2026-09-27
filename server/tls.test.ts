// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from './app';
import { createCa, createServerCert, describeCert } from './tls';

const ca = createCa();
const leaf = createServerCert(ca, ['localhost', '127.0.0.1', '192.168.1.20', 'hq.local']);

describe('certificates', () => {
  it('issues a server certificate signed by the CA for every given name and IP', () => {
    const caX = new X509Certificate(ca.certPem);
    const leafX = new X509Certificate(leaf.certPem);
    expect(caX.ca).toBe(true);
    expect(leafX.ca).toBe(false);
    expect(leafX.verify(caX.publicKey)).toBe(true);
    expect(leafX.checkIssued(caX)).toBe(true);
    expect(leafX.checkIP('192.168.1.20')).toBe('192.168.1.20');
    expect(leafX.checkHost('hq.local')).toBe('hq.local');
    expect(leafX.checkIP('10.9.9.9')).toBeUndefined();
    expect(describeCert(leaf.certPem).names).toEqual(['localhost', '127.0.0.1', '192.168.1.20', 'hq.local']);
  });

  it('encodes the Hebrew CA name as proper UTF-8 (browsers reject malformed names)', () => {
    const name = 'חפ"ק - רשות אישורים פנימית';
    // (Node prints the quote escaped)
    expect(new X509Certificate(ca.certPem).subject).toBe(`CN=${name.replace('"', '\\"')}`);
    expect(new X509Certificate(leaf.certPem).issuer).toBe(new X509Certificate(ca.certPem).subject);
    // The name's ASN.1 type byte must be UTF8String (0x0c), never PrintableString (0x13)
    const der = new X509Certificate(ca.certPem).raw;
    const utf8Name = Buffer.from(name, 'utf8');
    const at = der.indexOf(utf8Name);
    expect(at).toBeGreaterThan(0);
    expect(der[at - 2]).toBe(0x0c);
  });

  it('uses minimal DER serial numbers (a leading zero byte makes Chrome reject the certificate)', () => {
    for (let i = 0; i < 40; i++) {
      const serial = new X509Certificate(createServerCert(ca, ['localhost']).certPem).serialNumber;
      expect(serial.length).toBe(32);
      expect(serial.startsWith('0')).toBe(false);
    }
  });

  it('keeps leaf validity within what Apple devices accept (825 days)', () => {
    const days = (describeCert(leaf.certPem).notAfter.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(800);
    expect(days).toBeLessThanOrEqual(825);
  });

  it('refuses to issue a certificate without names', () => {
    expect(() => createServerCert(ca, ['  '])).toThrow();
  });
});

describe('HTTPS server', () => {
  let dir: string;
  let server: ReturnType<typeof createServer>;
  let port: number;
  let redirectPort: number;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tactical-tls-'));
    server = createServer({
      dbPath: join(dir, 'db.sqlite'),
      accessCode: 'code-4321',
      tickMs: 0,
      tls: { cert: leaf.certPem, key: leaf.keyPem, ca: ca.certPem },
    });
    port = await server.listen(0, '127.0.0.1');
    redirectPort = await server.listenRedirect(0, port, '127.0.0.1');
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const httpsGet = (path: string, trustCa = true) =>
    new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((ok, bad) => {
      const req = httpsRequest({ host: '127.0.0.1', port, path, ca: trustCa ? ca.certPem : undefined, servername: 'localhost' }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body }));
      });
      req.on('error', bad);
      req.end();
    });

  it('serves over HTTPS to a station that trusts the CA, with HSTS', async () => {
    const res = await httpsGet('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  it('is rejected by a client that has not installed the CA (it is real TLS, not a pass-through)', async () => {
    await expect(httpsGet('/api/health', false)).rejects.toThrow(/self[- ]signed|unable to verify|certificate/i);
  });

  it('carries live sync over WSS', async () => {
    const login = await new Promise<string>((ok, bad) => {
      const req = httpsRequest(
        { host: '127.0.0.1', port, path: '/api/login', method: 'POST', ca: ca.certPem, servername: 'localhost', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => ok(JSON.parse(body).token));
        }
      );
      req.on('error', bad);
      req.end(JSON.stringify({ station: 'עמדה א', code: 'code-4321' }));
    });
    const ws = new WebSocket(`wss://127.0.0.1:${port}/ws?token=${encodeURIComponent(login)}`, { ca: ca.certPem });
    const first = await new Promise<{ t: string }>((ok, bad) => {
      ws.once('message', (d) => ok(JSON.parse(d.toString())));
      ws.once('error', bad);
    });
    ws.terminate();
    expect(first.t).toBe('snapshot');
  });

  it('the HTTP helper port redirects to HTTPS and hands out only the CA certificate', async () => {
    const get = (path: string) =>
      new Promise<{ status: number; location?: string; body: string }>((ok) =>
        httpGet({ host: '127.0.0.1', port: redirectPort, path, headers: { Host: `127.0.0.1:${redirectPort}` } }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => ok({ status: res.statusCode ?? 0, location: res.headers.location, body }));
        })
      );
    const redirect = await get('/incidents?x=1');
    expect(redirect.status).toBe(308);
    expect(redirect.location).toBe(`https://127.0.0.1:${port}/incidents?x=1`);

    const caDownload = await get('/ca.crt');
    expect(caDownload.status).toBe(200);
    expect(caDownload.body).toBe(ca.certPem);
    expect(caDownload.body).not.toContain('PRIVATE KEY');
  });
});
