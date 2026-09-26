import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from './app';

// `npm start` passes --production (works on every OS, unlike NODE_ENV=... in an npm script)
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 8787);
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

mkdirSync(dirname(dbPath), { recursive: true });

const server = createServer({
  dbPath,
  accessCode,
  staticDir: production ? 'dist' : undefined,
  sessionSecret: process.env.SESSION_SECRET,
  // Number of proxies in front of the server (Render: 1); unset/0 = none
  trustProxy: Math.max(0, Number.parseInt(process.env.TRUST_PROXY ?? '0', 10) || 0),
});

const actualPort = await server.listen(port, host);
console.log(`Tactical ops server on http://${host}:${actualPort} (db: ${dbPath}${production ? ', serving dist/' : ''})`);

const shutdown = () => {
  console.log('Shutting down…');
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
