// T-61: the league and account are set for one transaction only, as the restricted
// role, and a league set in one transaction is gone in the next on the same connection.
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  freshSchema,
  newAccount,
  newLeague,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { createDatabase } from './create-database.ts';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import { transactionOf, type AppScope } from './transaction-scope.ts';
import { withTransaction } from './with-transaction.ts';

type Settings = {
  league: string | null;
  account: string | null;
  fenced_league: string | null;
  role: string;
};
const readSettings = sql<Settings>`select current_setting('app.league_id', true) as league,
  current_setting('app.account_id', true) as account,
  public.current_league_id()::text as fenced_league,
  current_user as role`;

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let account: string;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  account = await newAccount(pglite);
  // PGlite is one connection, so every transaction here runs on the same one.
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** Every programs row the scope can see, with no league filter: only the fence. */
const allPrograms = (scope: AppScope) =>
  transactionOf(scope).selectFrom('programs').select(['league_id']).execute();

describe('withTransaction', () => {
  it('sets the league and account for the transaction, as app_user', async () => {
    const seen = await withTransaction(db, { leagueId: a.leagueId, accountId: account }, (scope) =>
      readSettings.execute(transactionOf(scope)),
    );
    expect(seen.rows[0]).toEqual({
      league: a.leagueId,
      account,
      fenced_league: a.leagueId,
      role: 'app_user',
    });
  });

  it('leaves no league, account or role behind for the next transaction on the same connection', async () => {
    await withTransaction(db, { leagueId: a.leagueId, accountId: account }, (scope) =>
      readSettings.execute(transactionOf(scope)),
    );
    // The next transaction on the connection, not opened by withTransaction: what a
    // pooled connection would carry into the next request.
    const after = await kyselyOf(db)
      .transaction()
      .execute(async (trx) => {
        const settings = await readSettings.execute(trx);
        await sql`set local role app_user`.execute(trx);
        const programs = await trx.selectFrom('programs').select('id').execute();
        return { settings: settings.rows[0], programs };
      });
    expect(after.settings?.league ?? '').toBe('');
    expect(after.settings?.account ?? '').toBe('');
    expect(after.settings?.fenced_league).toBeNull();
    expect(after.settings?.role).toBe('postgres');
    expect(after.programs).toEqual([]);
  });

  it('shows league A only its own rows, with no filter in the query', async () => {
    const leagues = await withTransaction(db, { leagueId: a.leagueId }, async (scope) => ({
      programs: await allPrograms(scope),
      leagues: await transactionOf(scope).selectFrom('leagues').select('id').execute(),
    }));
    expect(leagues.programs.length).toBeGreaterThan(0);
    expect(leagues.programs.every((row) => row.league_id === a.leagueId)).toBe(true);
    expect(leagues.leagues).toEqual([{ id: a.leagueId }]);
  });

  it('sees no league rows when no league is set', async () => {
    const rows = await withTransaction(db, { accountId: account }, allPrograms);
    expect(rows).toEqual([]);
  });

  it('cannot write into another league', async () => {
    const write = withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      transactionOf(scope)
        .insertInto('programs')
        .values({ league_id: b.leagueId, slug: 'sneaky', name: 'Sneaky', sport_key: 'volleyball' })
        .execute(),
    );
    await expect(write).rejects.toMatchObject({ code: '42501' });
  });

  it('rolls back when the work throws', async () => {
    const failing = withTransaction(db, { leagueId: a.leagueId }, async (scope) => {
      await transactionOf(scope)
        .insertInto('programs')
        .values({ league_id: a.leagueId, slug: 'undone', name: 'Undone', sport_key: 'volleyball' })
        .execute();
      throw new Error('stop');
    });
    await expect(failing).rejects.toThrow('stop');
    const { rows } = await pglite.query("select id from programs where slug = 'undone'");
    expect(rows).toEqual([]);
  });

  it('refuses ids that are not UUIDs before any query runs', async () => {
    const query = vi.spyOn(pglite, 'query');
    const exec = vi.spyOn(pglite, 'exec');
    try {
      await expect(withTransaction(db, { leagueId: 'league-a' }, async () => 1)).rejects.toThrow(
        'leagueId is not a UUID',
      );
      await expect(
        withTransaction(db, { leagueId: a.leagueId, accountId: `${account}'` }, async () => 1),
      ).rejects.toThrow('accountId is not a UUID');
      expect(query).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
      exec.mockRestore();
    }
  });

  it('accepts an upper-case UUID and sets it as the database reads it', async () => {
    const seen = await withTransaction(db, { leagueId: a.leagueId.toUpperCase() }, (scope) =>
      readSettings.execute(transactionOf(scope)),
    );
    expect(seen.rows[0]?.league).toBe(a.leagueId);
  });

  it('closes the scope when the transaction ends', async () => {
    const kept = await withTransaction(db, { leagueId: a.leagueId }, async (scope) => scope);
    expect(() => transactionOf(kept)).toThrow('not open');
  });

  it('refuses a nested withTransaction instead of waiting forever', async () => {
    const nested = withTransaction(db, { leagueId: a.leagueId }, () =>
      withTransaction(db, { leagueId: b.leagueId }, allPrograms),
    );
    await expect(nested).rejects.toThrow('inside another withTransaction');
  });

  it('refuses a query on the bare handle inside the work', async () => {
    const bare = withTransaction(db, { leagueId: a.leagueId }, () =>
      kyselyOf(db).selectFrom('programs').select('league_id').execute(),
    );
    await expect(bare).rejects.toThrow('second connection was asked for inside withTransaction');
  });
});
