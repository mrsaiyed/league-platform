import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMadeUpAddress } from './made-up-address.ts';

// The one shared list of spellings and their answers. packages/database/src/schema/
// kept-emails.test.ts holds the SQL check (migration 0023) to the same file.
const cases = JSON.parse(
  readFileSync(new URL('./made-up-address-cases.json', import.meta.url), 'utf8'),
) as readonly { readonly address: string; readonly madeUp: boolean }[];

describe('isMadeUpAddress (record 075)', () => {
  it('takes the names kept for made-up mail only, as the shared list says', () => {
    expect(cases.length).toBeGreaterThan(40);
    expect(cases.map((c) => [c.address, isMadeUpAddress(c.address)])).toEqual(
      cases.map((c) => [c.address, c.madeUp]),
    );
  });
});
