import { describe, expect, it } from 'vitest';
import { migrationChecksum, normalizeMigrationText } from './checksum.ts';

const byteOrderMark = String.fromCharCode(0xfeff);

describe('normalizeMigrationText', () => {
  it('removes a leading byte-order mark and turns CRLF into LF', () => {
    expect(normalizeMigrationText(byteOrderMark + 'a;\r\nb;\r\n')).toBe('a;\nb;\n');
  });

  it('leaves other text, and a mark that is not at the start, alone', () => {
    const text = 'a;\rb;\n' + byteOrderMark;
    expect(normalizeMigrationText(text)).toBe(text);
  });
});

describe('migrationChecksum', () => {
  it('is SHA-256 as 64 hex characters', () => {
    // SHA-256 of the empty string.
    expect(migrationChecksum('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is the same across line endings and a byte-order mark, and changes with the text', () => {
    const lf = 'create table t (id int);\n';
    expect(migrationChecksum(byteOrderMark + lf.replace('\n', '\r\n'))).toBe(migrationChecksum(lf));
    expect(migrationChecksum(lf + ' ')).not.toBe(migrationChecksum(lf));
  });
});
