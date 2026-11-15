// listMyLeagues and public.my_leagues (0018, record 066): the leagues of the account set
// for the transaction, and of no other; nothing with no account set; never a league in
// the bin; nothing about anyone else. Each promise of record 066 has its case here.
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { transactionOf } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  asApp,
  freshSchema,
  newAccount,
  newLeague,
  newPerson,
  newProgram,
  newRosterEntry,
  newSeason,
  newTeam,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listMyLeagues } from './list-my-leagues.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let one1: MadeLeague;
let two: MadeLeague;
let binned: MadeLeague;
let accountA: string;
let accountB: string;
let player: string;
let left: string;

/** A profile for `accountId` and its link, as create_own_profile makes them. */
async function profileOf(accountId: string): Promise<string> {
  const profile = await one<{ id: string }>(
    pglite,
    "insert into profiles (first_name, last_name) values ('Made-up', 'Player') returning id",
  );
  await pglite.query(
    "insert into profile_access (account_id, profile_id, relation) values ($1, $2, 'self')",
    [accountId, profile.id],
  );
  return profile.id;
}

/** A roster place in `league` for a person linked to `profileId`; returns the entry. */
async function rosterPlace(league: MadeLeague, profileId: string): Promise<string> {
  const season = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  const team = await newTeam(pglite, league.leagueId, season);
  const person = await newPerson(pglite, league.leagueId, { profileId });
  return newRosterEntry(pglite, league.leagueId, team, person);
}

const leaguesAs = (accountId: string) =>
  withTransaction(db, { accountId }, (scope) => listMyLeagues(scope));

beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  one1 = await newLeague(pglite);
  two = await newLeague(pglite);
  binned = await newLeague(pglite);
  accountA = await newAccount(pglite);
  accountB = await newAccount(pglite);
  player = await newAccount(pglite);
  left = await newAccount(pglite);
  // A: a scorekeeper in league 1 and nothing in league 2. B: an admin of league 2.
  await pglite.query(
    `insert into role_grants (league_id, account_id, role) values
       ($1, $2, 'scorekeeper'), ($3, $4, 'admin'), ($5, $2, 'admin')`,
    [one1.leagueId, accountA, two.leagueId, accountB, binned.leagueId],
  );
  // A also schedules one program of league 1; a revoked grant in league 2 counts for nothing.
  const program = await newProgram(pglite, one1.leagueId);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, 'scheduler', 'program', $3)`,
    [one1.leagueId, accountA, program],
  );
  await pglite.query(
    "insert into role_grants (league_id, account_id, role) values ($1, $2, 'editor')",
    [two.leagueId, accountA],
  );
  await pglite.query(
    `update role_grants set revoked_at = now(), revoked_by_account_id = $3
     where league_id = $1 and account_id = $2 and role = 'editor'`,
    [two.leagueId, accountA, two.ownerId],
  );
  // The player: a roster place in league 2 only. The leaver: one they have left.
  await rosterPlace(two, await profileOf(player));
  const gone = await rosterPlace(one1, await profileOf(left));
  await pglite.query('update roster_entries set left_on = current_date where id = $1', [gone]);
  await pglite.query('update leagues set deleted_at = now() where id = $1', [binned.leagueId]);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('listMyLeagues (record 066)', () => {
  it('gives a role in league 1 and none in league 2 league 1 only, with what it holds', async () => {
    const found = await leaguesAs(accountA);
    expect(found.map((l) => l.leagueId)).toEqual([one1.leagueId]);
    expect(found[0]).toMatchObject({
      isOwner: false,
      roles: ['scheduler', 'scorekeeper'],
      leagueWideRoles: ['scorekeeper'],
      onRoster: false,
      status: 'draft',
    });
  });

  // The isolation case: account A never sees account B's leagues, nor B A's.
  it("never gives one account another's leagues", async () => {
    const a = await leaguesAs(accountA);
    const b = await leaguesAs(accountB);
    expect(b.map((l) => l.leagueId)).toEqual([two.leagueId]);
    expect(a.some((l) => l.leagueId === two.leagueId)).toBe(false);
    expect(b.some((l) => l.leagueId === one1.leagueId)).toBe(false);
  });

  it('lists a league its owner owns, with no role needed', async () => {
    const found = await leaguesAs(one1.ownerId);
    expect(found).toEqual([
      expect.objectContaining({ leagueId: one1.leagueId, isOwner: true, roles: [] }),
    ]);
  });

  it('lists a current roster place, and not one the person has left', async () => {
    expect((await leaguesAs(player)).map((l) => [l.leagueId, l.onRoster])).toEqual([
      [two.leagueId, true],
    ]);
    expect(await leaguesAs(left)).toEqual([]);
  });

  it('never lists a league in the bin, whoever holds a role in it', async () => {
    for (const who of [accountA, binned.ownerId]) {
      expect((await leaguesAs(who)).some((l) => l.leagueId === binned.leagueId)).toBe(false);
    }
  });

  it('gives nothing to a transaction with no account set', async () => {
    expect(await withTransaction(db, {}, (scope) => listMyLeagues(scope))).toEqual([]);
    const rows = await withTransaction(db, {}, async (scope) => {
      const { rows } = await sql`select * from public.my_leagues()`.execute(transactionOf(scope));
      return rows;
    });
    expect(rows).toEqual([]);
  });

  it('returns these columns and no others: nothing personal, no counts', async () => {
    const columns = await asApp(pglite, { account: accountA }, async (tx) => {
      const result = await tx.query('select * from public.my_leagues()');
      return result.fields.map((f) => f.name);
    });
    expect(columns).toEqual([
      'league_id',
      'slug',
      'name',
      'status',
      'is_owner',
      'roles',
      'league_wide_roles',
      'on_roster',
    ]);
  });
});

describe('my_leagues() answers for the account set and no other (record 066)', () => {
  it('takes no argument, so no account can be named to it', async () => {
    const fn = await one<{ args: number; definer: boolean; config: string[] | null }>(
      pglite,
      `select pronargs::int as args, prosecdef as definer, proconfig as config
       from pg_proc where proname = 'my_leagues' and pronamespace = 'public'::regnamespace`,
    );
    expect(fn).toEqual({ args: 0, definer: true, config: ['search_path=pg_catalog, pg_temp'] });
    await expect(
      asApp(pglite, { account: accountA }, (tx) =>
        tx.query('select * from public.my_leagues($1)', [accountB]),
      ),
    ).rejects.toMatchObject({ code: '42883' });
  });

  it('is not changed by any other setting the app role can change', async () => {
    const leagueIdsOf = (rows: readonly { league_id: string }[]) => rows.map((r) => r.league_id);
    const base = await asApp(pglite, { account: accountA }, async (tx) =>
      leagueIdsOf(
        (await tx.query<{ league_id: string }>('select * from public.my_leagues()')).rows,
      ),
    );
    expect(base).toEqual([one1.leagueId]);
    // The league set (B's), the search path, and (where the app role may make one) a
    // table of the same name in the session's own temporary schema: the answer is still
    // A's alone, since the function's own search path is fixed and every name in it is
    // written in full.
    const { temp } = await one<{ temp: boolean }>(
      pglite,
      "select has_database_privilege('app_user', current_database(), 'TEMP') as temp",
    );
    const moved = await asApp(pglite, { account: accountA, league: two.leagueId }, async (tx) => {
      await tx.query('set local search_path = pg_temp, public');
      if (temp) {
        await tx.query(
          `create temporary table role_grants on commit drop as
           select $1::uuid as league_id, $1::uuid as account_id`,
          [two.leagueId],
        );
      }
      return leagueIdsOf(
        (await tx.query<{ league_id: string }>('select * from public.my_leagues()')).rows,
      );
    });
    expect(moved).toEqual([one1.leagueId]);
    // A setting that is not an account id is no account.
    for (const setting of ['', 'not-an-id', `${accountB} `, `${accountA},${accountB}`]) {
      const rows = await asApp(pglite, {}, async (tx) => {
        await tx.query("select set_config('app.account_id', $1, true)", [setting]);
        return (await tx.query('select * from public.my_leagues()')).rows;
      });
      expect({ setting, rows }).toEqual({ setting, rows: [] });
    }
  });

  it('may be run by the app role and no one else', async () => {
    const { app, everyone } = await one<{ app: boolean; everyone: boolean }>(
      pglite,
      `select has_function_privilege('app_user', 'public.my_leagues()', 'EXECUTE') as app,
              exists (
                select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                where p.proname = 'my_leagues' and acl.grantee = 0
              ) as everyone`,
    );
    expect({ app, everyone }).toEqual({ app: true, everyone: false });
  });
});
