import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from './app';

// `npm start` passes --production (works on every OS, unlike NODE_ENV=... in an npm script)
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? 'data/tactical.db';

let accessCode = process.env.ACCESS_CODE ?? '';
if (!accessCode) {
  if (production) {
    console.error('ACCESS_CODE is required in production (the shared code stations log in with).');
    process.exit(1);
  }
  accessCode = '1234';
  console.warn('ACCESS_CODE not set — using development code 1234. Never run like this on a real network.');
}

// HTTPS: explicit TLS_CERT/TLS_KEY, or (in production) the files `npm run cert` writes to data/tls/.
// Development stays on plain HTTP, because Vite proxies to it.
const TLS_DIR = 'data/tls';
const certPath = process.env.TLS_CERT ?? (production ? `${TLS_DIR}/server.crt` : '');
const keyPath = process.env.TLS_KEY ?? (production ? `${TLS_DIR}/server.key` : '');
const caPath = process.env.TLS_CA ?? `${TLS_DIR}/ca.crt`;
const useTls = !!certPath && !!keyPath && existsSync(certPath) && existsSync(keyPath);
if ((process.env.TLS_CERT || process.env.TLS_KEY) && !useTls) {
  console.error(`TLS_CERT/TLS_KEY set but not found (${certPath}, ${keyPath}).`);
  process.exit(1);
}
const tls = useTls
  ? {
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8'),
      ca: existsSync(caPath) ? readFileSync(caPath, 'utf8') : undefined,
    }
  : undefined;

const port = Number(process.env.PORT ?? (tls ? 8443 : 8787));
// Next to HTTPS, a plain-HTTP port redirects to it and hands out the CA certificate; HTTP_PORT=0 turns it off
const httpPort = tls ? Number(process.env.HTTP_PORT ?? 8080) : 0;

const trustProxy = Math.max(0, Number.parseInt(process.env.TRUST_PROXY ?? '0', 10) || 0);

mkdirSync(dirname(dbPath), { recursive: true });

const server = createServer({
  dbPath,
  accessCode,
  staticDir: production ? 'dist' : undefined,
  sessionSecret: process.env.SESSION_SECRET,
  // Number of proxies in front of the server (Render: 1); unset/0 = none
  trustProxy,
  tls,
  log: (line) => console.log(line),
});

const actualPort = await server.listen(port, host);
const scheme = tls ? 'https' : 'http';
console.log(`Tactical ops server on ${scheme}://${host}:${actualPort} (db: ${dbPath}${production ? ', serving dist/' : ''})`);
if (tls && httpPort) {
  const redirectPort = await server.listenRedirect(httpPort, actualPort, host);
  console.log(`HTTP on port ${redirectPort} redirects to HTTPS; new stations get the CA at http://<server>:${redirectPort}/ca.crt`);
}
// Behind a proxy (TRUST_PROXY) HTTPS is the proxy's job, e.g. Render
if (production && !tls && trustProxy === 0) {
  console.warn('Serving plain HTTP: the access code and data cross the network unencrypted. Run `npm run cert` to enable HTTPS.');
}

const shutdown = () => {
  console.log('Shutting down…');
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
