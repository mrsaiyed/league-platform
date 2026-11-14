import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgliteDriver, type MigrationDriver } from '../migrations/index.ts';
import { freshSchema, newAccount, newLeague } from '../schema/schema.test-helper.ts';
import {
  accountForEmail,
  findAccountByEmail,
  hasLeagueCity,
  isShortNameHeld,
  newLeagueId,
} from './login-queries.ts';

let pglite: PGlite;
let login: MigrationDriver;
beforeAll(async () => {
  pglite = await freshSchema();
  login = pgliteDriver(pglite);
});
afterAll(async () => {
  await pglite.close();
});

describe('the accounts named by email', () => {
  it('finds an account whatever the capitals', async () => {
    const id = await newAccount(pglite, 'Found.Me@example.test');
    expect(await findAccountByEmail(login, 'found.me@EXAMPLE.test')).toBe(id);
    expect(await findAccountByEmail(login, 'nobody@example.test')).toBeUndefined();
  });

  it('makes an account once, with no name and no sign-in, and then finds it', async () => {
    const made = await login.transaction((tx) => accountForEmail(tx, 'Fresh@example.test'));
    expect(made.made).toBe(true);
    expect(await login.transaction((tx) => accountForEmail(tx, 'fresh@example.test'))).toEqual({
      accountId: made.accountId,
      made: false,
    });
    const { rows } = await pglite.query(
      'select email, display_name, sign_in_id from accounts where id = $1',
      [made.accountId],
    );
    expect(rows).toEqual([{ email: 'Fresh@example.test', display_name: null, sign_in_id: null }]);
  });
});

describe('the checks before a league is made', () => {
  it('knows a short name a league holds', async () => {
    await newLeague(pglite, 'held-name');
    expect(await isShortNameHeld(login, 'held-name')).toBe(true);
    expect(await isShortNameHeld(login, 'free-name')).toBe(false);
  });

  it('knows a short name that still forwards to a league (U-7)', async () => {
    const { leagueId } = await newLeague(pglite, 'old-name');
    await pglite.query("update leagues set slug = 'new-name' where id = $1", [leagueId]);
    await pglite.query(
      "insert into league_slug_history (league_id, old_slug, expires_at) values ($1, 'old-name', now() + interval '1 year')",
      [leagueId],
    );
    expect(await isShortNameHeld(login, 'old-name')).toBe(true);
  });

  it('gives a new league id, and sees the city column of 0014', async () => {
    expect(await newLeagueId(login)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await hasLeagueCity(login)).toBe(true);
  });
});
