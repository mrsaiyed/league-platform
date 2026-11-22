// The database server's certificate setting, PLATFORM_DATABASE_CA (step 2.203, T-299),
// read the same way by the web app's and the worker's settings checks, once, at start.
//
// The value is either the certificate's own text (PEM, from -----BEGIN CERTIFICATE-----
// to -----END CERTIFICATE-----, one certificate or several) or the path of a file that
// holds it. Every block must be a certificate the computer can read (X509Certificate),
// or the setting is refused by name. A private key in it is refused: it is never handed
// to a program that only checks the server. Nothing in a refusal repeats the value, the
// path or the file's text.
import { X509Certificate } from 'node:crypto';

/** Reads a file's text; throws when it cannot. config.ts hands the real one. */
export type CertificateFileReader = (path: string) => string;

export type DatabaseCertificate =
  | { readonly ok: true; readonly pem: string }
  | { readonly ok: false; readonly problem: string };

const pemBlocks = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

const isCertificate = (block: string): boolean => {
  try {
    new X509Certificate(block);
    return true;
  } catch {
    return false;
  }
};

/**
 * The certificate text `value` gives for the setting `name`: its own text, or the text
 * of the file it names, read by `readFile` (without one, only text is taken). A host's
 * settings page may keep the line breaks as the two characters \n; they are put back.
 */
export function databaseCertificateFrom(
  name: string,
  value: string,
  readFile?: CertificateFileReader,
): DatabaseCertificate {
  const given = value.trim();
  let text: string;
  if (given.startsWith('-----BEGIN')) {
    text = given;
  } else {
    try {
      if (readFile === undefined) throw new Error('no file reader');
      text = readFile(given);
    } catch {
      return {
        ok: false,
        problem: `${name}: invalid, it names a file that cannot be read; give the path of a file this program can read, or the certificate’s own PEM text`,
      };
    }
  }
  text = text.replace(/\\n/g, '\n');
  if (/PRIVATE KEY/.test(text)) {
    return {
      ok: false,
      problem: `${name}: invalid, it holds a private key, which this program never takes; give only the server’s certificate`,
    };
  }
  const blocks = text.match(pemBlocks) ?? [];
  if (blocks.length === 0 || !blocks.every(isCertificate)) {
    return {
      ok: false,
      problem: `${name}: invalid, must be the server’s certificate: its PEM text, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----, or the path of a file holding it`,
    };
  }
  return { ok: true, pem: `${blocks.join('\n')}\n` };
}
