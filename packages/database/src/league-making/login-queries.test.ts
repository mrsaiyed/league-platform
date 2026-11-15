import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgliteDriver, type MigrationDriver } from '../migrations/index.ts';
import { freshSchema, newAccount, newLeague } from '../schema/schema.test-helper.ts';
import {
  accountByEmail,
  accountForEmail,
  appliedMigrations,
  leagueHoldingShortName,
  newLeagueId,
  removeUnusedAccount,
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

const exists = async (id: string) =>
  (await pglite.query('select 1 from accounts where id = $1', [id])).rows.length === 1;

describe('the accounts named by email', () => {
  it('finds an account whatever the capitals, and says whether anyone signed in with it', async () => {
    const id = await newAccount(pglite, 'Found.Me@example.test');
    expect(await accountByEmail(login, 'found.me@EXAMPLE.test')).toEqual({
      accountId: id,
      signedUp: false,
    });
    await pglite.query("update accounts set sign_in_id = 'made-up-sign-in-9' where id = $1", [id]);
    expect(await accountByEmail(login, 'found.me@example.test')).toEqual({
      accountId: id,
      signedUp: true,
    });
    expect(await accountByEmail(login, 'nobody@example.test')).toBeUndefined();
  });

  it('makes an account once, with no name and no sign-in, and then finds it', async () => {
    const made = await login.transaction((tx) => accountForEmail(tx, 'Fresh@example.test'));
    expect(made).toMatchObject({ made: true, signedUp: false });
    expect(await login.transaction((tx) => accountForEmail(tx, 'fresh@example.test'))).toEqual({
      accountId: made.accountId,
      signedUp: false,
      made: false,
    });
    const { rows } = await pglite.query(
      'select email, display_name, sign_in_id from accounts where id = $1',
      [made.accountId],
    );
    expect(rows).toEqual([{ email: 'Fresh@example.test', display_name: null, sign_in_id: null }]);
  });
});

describe('removing an account a run made', () => {
  const remove = (accountId: string, email: string) =>
    login.transaction((tx) => removeUnusedAccount(tx, { accountId, email }));

  it('removes one nobody has signed in with and no league uses', async () => {
    const id = await newAccount(pglite, 'unused@example.test');
    expect(await remove(id, 'unused@example.test')).toBe(true);
    expect(await exists(id)).toBe(false);
  });

  it('leaves one somebody has signed in with', async () => {
    const id = await newAccount(pglite, 'signed.in@example.test');
    await pglite.query("update accounts set sign_in_id = 'made-up-sign-in-8' where id = $1", [id]);
    expect(await remove(id, 'signed.in@example.test')).toBe(false);
    expect(await exists(id)).toBe(true);
  });

  it('leaves one that owns a league', async () => {
    const { ownerId } = await newLeague(pglite);
    const { rows } = await pglite.query<{ email: string }>(
      'select email from accounts where id = $1',
      [ownerId],
    );
    expect(await remove(ownerId, rows[0]!.email)).toBe(false);
    expect(await exists(ownerId)).toBe(true);
  });
});

describe('the checks before a league is made', () => {
  it('knows which league holds a short name', async () => {
    const { leagueId } = await newLeague(pglite, 'held-name');
    expect(await leagueHoldingShortName(login, 'held-name')).toBe(leagueId);
    expect(await leagueHoldingShortName(login, 'free-name')).toBeUndefined();
  });

  it('knows a short name that still forwards to a league (U-7)', async () => {
    const { leagueId } = await newLeague(pglite, 'old-name');
    await pglite.query("update leagues set slug = 'new-name' where id = $1", [leagueId]);
    await pglite.query(
      "insert into league_slug_history (league_id, old_slug, expires_at) values ($1, 'old-name', now() + interval '1 year')",
      [leagueId],
    );
    expect(await leagueHoldingShortName(login, 'old-name')).toBe(leagueId);
  });

  it('gives a new league id', async () => {
    expect(await newLeagueId(login)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reads the migration log in order', async () => {
    const applied = await appliedMigrations(login);
    expect(applied?.[0]).toMatchObject({ version: 1, name: '0001_migration_log.sql' });
    expect(applied?.map((m) => m.version)).toEqual(
      [...(applied ?? [])].map((m) => m.version).sort((a, b) => a - b),
    );
  });
});
