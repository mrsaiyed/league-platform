import { describe, expect, it } from 'vitest';
import { migrationChecksum } from './checksum.ts';
import type { Migration } from './migration-types.ts';
import { validateMigrations } from './validate-migrations.ts';

const m = (version: number, name: string, sql = 'select 1;\n'): Migration => ({
  version,
  name,
  sql,
  checksum: migrationChecksum(sql),
});

describe('validateMigrations', () => {
  it('accepts an ordered list without gaps, and an empty one', () => {
    expect(validateMigrations([m(1, '0001_a.sql'), m(2, '0002_b.sql')])).toBeUndefined();
    expect(validateMigrations([])).toBeUndefined();
  });

  it.each([
    ['a name that does not match its number', [m(2, '0001_a.sql')], 'bad_file_name'],
    ['a badly formed name', [m(1, '1_a.sql')], 'bad_file_name'],
    ['a list out of order', [m(2, '0002_b.sql'), m(1, '0001_a.sql')], 'version_gap'],
    ['a repeated number', [m(1, '0001_a.sql'), m(1, '0001_b.sql')], 'duplicate_version'],
    ['a forged checksum', [{ ...m(1, '0001_a.sql'), checksum: 'f'.repeat(64) }], 'bad_checksum'],
    ['only comments', [m(1, '0001_a.sql', '-- nothing\n')], 'empty_file'],
    ['a COMMIT', [m(1, '0001_a.sql', 'select 1;\ncommit;\n')], 'transaction_control'],
    ['a START TRANSACTION', [m(1, '0001_a.sql', 'start transaction;\n')], 'transaction_control'],
    ['a RELEASE', [m(1, '0001_a.sql', 'release savepoint s;\n')], 'transaction_control'],
  ])('rejects %s', (_, list, code) => {
    expect(validateMigrations(list)?.code).toBe(code);
  });
});
