import { describe, expect, it } from 'vitest';
import { isMadeUpAddress } from './made-up-address.ts';

// The same list as packages/database/src/schema/kept-emails.test.ts, which holds the SQL
// check (migration 0023) to it: the first ten are made up, the rest not.
const addresses = [
  'new.owner@example.test',
  'A@Sub.Example.COM',
  'x@example.net',
  'x@mail.example.org',
  'x@site.example',
  'x@nowhere.invalid',
  'x@here.localhost',
  'x@example.test.',
  ' x@example.test ',
  'x@y@example.test',
  'person@gmail.com',
  'x@example.com.evil.com',
  'x@notexample.com',
  'x@test',
  '@example.test',
  'example.test',
  'x@exa mple.test',
  'x@ex_ample.test',
  'x@',
  '',
];

describe('isMadeUpAddress (record 075)', () => {
  it('takes the names kept for made-up mail only', () => {
    expect(addresses.map(isMadeUpAddress)).toEqual(addresses.map((_, i) => i < 10));
  });
});
