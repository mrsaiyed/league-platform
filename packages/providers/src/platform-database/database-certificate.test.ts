import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { databaseCertificateFrom } from './database-certificate.ts';

const fixture = new URL('./fixtures/made-up-database-ca.pem', import.meta.url);
const pem = readFileSync(fixture, 'utf8');
const name = 'PLATFORM_DATABASE_CA';
const reader = (files: Record<string, string>) => (path: string) => {
  const text = files[path];
  if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
  return text;
};

describe('databaseCertificateFrom', () => {
  it('takes the certificate’s own text', () => {
    expect(databaseCertificateFrom(name, pem)).toEqual({ ok: true, pem: `${pem.trim()}\n` });
  });

  it('takes the line breaks a settings page kept as \\n', () => {
    const oneLine = pem.trim().replace(/\n/g, '\\n');
    expect(databaseCertificateFrom(name, oneLine)).toEqual({ ok: true, pem: `${pem.trim()}\n` });
  });

  it('takes one pair of surrounding quotes off, double or single, before deciding', () => {
    const want = { ok: true, pem: `${pem.trim()}\n` };
    expect(databaseCertificateFrom(name, `"${pem.trim()}"`)).toEqual(want);
    expect(databaseCertificateFrom(name, `'${pem.trim()}'`)).toEqual(want);
    expect(databaseCertificateFrom(name, ` "${pem.trim().replace(/\n/g, '\\n')}" `)).toEqual(want);
    const read = reader({ './made-up-ca.pem': pem });
    expect(databaseCertificateFrom(name, `'./made-up-ca.pem'`, read)).toEqual(want);
  });

  it('takes several certificates, and reads a file the value names', () => {
    const read = reader({ './made-up-ca.pem': `Made-up bundle\n${pem}\n${pem}` });
    const found = databaseCertificateFrom(name, './made-up-ca.pem', read);
    expect(found).toEqual({ ok: true, pem: `${pem.trim()}\n${pem.trim()}\n` });
  });

  it('refuses, by name and without the value, what is not a certificate', () => {
    const fake = '-----BEGIN CERTIFICATE-----\nMADEUPmadeup0123\n-----END CERTIFICATE-----';
    for (const value of [fake, `${pem}\n${fake}`]) {
      const found = databaseCertificateFrom(name, value);
      expect(found.ok).toBe(false);
      if (found.ok) continue;
      expect(found.problem).toMatch(
        /^PLATFORM_DATABASE_CA: invalid, must be the server’s certificate/,
      );
      expect(found.problem).not.toContain('MADEUP');
      expect(found.problem).not.toContain(pem.split('\n')[1]);
    }
    const read = reader({ './notes.txt': 'made-up notes' });
    expect(databaseCertificateFrom(name, './notes.txt', read).ok).toBe(false);
  });

  it('refuses a file it cannot read, without naming the path', () => {
    for (const read of [reader({}), undefined]) {
      const found = databaseCertificateFrom(name, '/made-up/secret-place/ca.pem', read);
      expect(found).toEqual({
        ok: false,
        problem:
          'PLATFORM_DATABASE_CA: invalid, it names a file that cannot be read; give the path of a file this program can read, or the certificate’s own PEM text',
      });
    }
  });

  it('refuses a private key, and never repeats it', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nMADEUPkeykeykey\n-----END PRIVATE KEY-----\n' + pem;
    const found = databaseCertificateFrom(name, key);
    expect(found.ok).toBe(false);
    if (!found.ok) {
      expect(found.problem).toMatch(/holds a private key/);
      expect(found.problem).not.toContain('MADEUPkey');
    }
  });
});
