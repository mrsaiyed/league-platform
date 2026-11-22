import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMadeUpAddress, keptAddressOf } from './made-up-address.ts';

// The one shared list of spellings and their answers. packages/database/src/schema/
// kept-emails.test.ts holds the SQL check (migration 0023) to the same file.
const cases = JSON.parse(
  readFileSync(new URL('./made-up-address-cases.json', import.meta.url), 'utf8'),
) as readonly { readonly address: string; readonly madeUp: boolean }[];

describe('keptAddressOf (migration 0023’s kept_form)', () => {
  it('gives the form the check sees: trimmed, one final dot dropped, A to Z in small letters', () => {
    expect(keptAddressOf('a@x.test.')).toBe('a@x.test');
    expect(keptAddressOf('\t New.Owner@Example.TEST.　')).toBe('new.owner@example.test');
    expect(keptAddressOf('İ@x.test')).toBe('İ@x.test');
  });
});

describe('isMadeUpAddress (record 075)', () => {
  it('takes the names kept for made-up mail only, as the shared list says', () => {
    expect(cases.length).toBeGreaterThan(40);
    expect(cases.map((c) => [c.address, isMadeUpAddress(c.address)])).toEqual(
      cases.map((c) => [c.address, c.madeUp]),
    );
  });
});
