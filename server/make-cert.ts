import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createCa, createServerCert, describeCert } from './tls';

/**
 * npm run cert [-- extra-name-or-ip ...]
 * Creates (once) a private CA for the command-post network and issues this server a certificate for
 * every address it can be reached at. Re-run after the server's IP or name changes: the CA is kept,
 * so stations that already installed it keep trusting the new certificate.
 */
const dir = process.env.TLS_DIR ?? 'data/tls';
mkdirSync(dir, { recursive: true });

const writeSecret = (file: string, data: string) => {
  writeFileSync(file, data);
  chmodSync(file, 0o600); // private keys: owner only
};

const caCertPath = join(dir, 'ca.crt');
const caKeyPath = join(dir, 'ca.key');
let ca;
if (existsSync(caCertPath) && existsSync(caKeyPath)) {
  ca = { certPem: readFileSync(caCertPath, 'utf8'), keyPem: readFileSync(caKeyPath, 'utf8') };
  console.log(`Using the existing CA in ${dir} (stations that installed it need nothing new).`);
} else {
  ca = createCa();
  writeFileSync(caCertPath, ca.certPem);
  writeSecret(caKeyPath, ca.keyPem);
  console.log(`Created a new CA in ${dir}.`);
}

const host = hostname();
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n!.address);
const names = ['localhost', '127.0.0.1', host, `${host}.local`, ...lanIps, ...process.argv.slice(2)];

const server = createServerCert(ca, names);
writeFileSync(join(dir, 'server.crt'), server.certPem);
writeSecret(join(dir, 'server.key'), server.keyPem);

const info = describeCert(server.certPem);
console.log(`
Server certificate written to ${dir}/server.crt (valid until ${info.notAfter.toISOString().slice(0, 10)}) for:
  ${info.names.join('\n  ')}

Next:
  1. Start the server:        ACCESS_CODE='...' npm start      (HTTPS on 8443, HTTP helper on 8080)
  2. On every station, once:  open http://<server>:8080/ca.crt and install it as a trusted root
                              (details in README → HTTPS)
  3. Stations then use:       https://<server>:8443

Keep ${caKeyPath} secret and backed up: anyone holding it can impersonate this server to the stations.
`);
