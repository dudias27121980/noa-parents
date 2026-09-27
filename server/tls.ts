import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import forge from 'node-forge';

/**
 * A private certificate authority for the command-post network: the CA is installed once on every
 * station, and signs the server's certificate, so browsers trust https://<server> without warnings.
 * Keys are generated with Node's crypto (fast); node-forge only assembles the X.509 certificates.
 */

export interface KeyPairPem {
  certPem: string;
  keyPem: string;
}

const CA_YEARS = 10;
// Apple platforms reject leaf certificates valid for more than 825 days, even from a private CA
const SERVER_DAYS = 825;

const newKeys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    keyPem: privateKey,
    privateKey: forge.pki.privateKeyFromPem(privateKey),
    publicKey: forge.pki.publicKeyFromPem(publicKey),
  };
};

// Unique random serial that DER-encodes minimally: the first byte is 0x40–0x7f, so it is never
// negative (high bit) and never a leading zero (Chrome rejects non-minimal integers as malformed)
export const serial = () => {
  const bytes = randomBytes(16);
  bytes[0] = (bytes[0] & 0x3f) | 0x40;
  return bytes.toString('hex');
};

export function createCa(name = 'חפ"ק - רשות אישורים פנימית'): KeyPairPem {
  const keys = newKeys();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + CA_YEARS * 365 * 86_400_000);
  // Explicit UTF8String: forge's default (PrintableString) cannot hold Hebrew, and browsers reject the
  // result as malformed. forge UTF-8-encodes the value itself for this type, so pass the plain string.
  const subject = [
    { name: 'commonName', value: name, valueTagClass: forge.asn1.Type.UTF8 as unknown as forge.asn1.Class },
  ];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: keys.keyPem };
}

/** Server certificate for every name/IP the stations may type in the address bar */
export function createServerCert(ca: KeyPairPem, names: string[]): KeyPairPem {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) throw new Error('At least one host name or IP address is required');

  const caCert = forge.pki.certificateFromPem(ca.certPem);
  const caKey = forge.pki.privateKeyFromPem(ca.keyPem);
  const keys = newKeys();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + SERVER_DAYS * 86_400_000);
  cert.setSubject([{ name: 'commonName', value: unique[0] }]);
  // The issuer must match the CA's subject byte for byte. forge parses a UTF8String into raw UTF-8
  // bytes but encodes it again on write, so decode first — otherwise the name is double-encoded and
  // the chain no longer links up.
  cert.setIssuer(
    caCert.subject.attributes.map((attr) =>
      attr.valueTagClass === (forge.asn1.Type.UTF8 as unknown as forge.asn1.Class)
        ? { ...attr, value: forge.util.decodeUtf8(String(attr.value)) }
        : attr
    )
  );
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    // Browsers match only on SubjectAltName: type 7 = IP address, type 2 = DNS name
    { name: 'subjectAltName', altNames: unique.map((n) => (isIP(n) ? { type: 7, ip: n } : { type: 2, value: n })) },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: caCert.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: keys.keyPem };
}

/** Names/IPs a certificate is valid for, and when it expires (shown by `npm run cert`) */
export function describeCert(certPem: string) {
  const cert = forge.pki.certificateFromPem(certPem);
  const san = cert.getExtension('subjectAltName') as { altNames?: { ip?: string; value?: string }[] } | null;
  return {
    names: (san?.altNames ?? []).map((a) => a.ip ?? a.value ?? '').filter(Boolean),
    notAfter: cert.validity.notAfter,
  };
}
