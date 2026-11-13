// T4 §2, the third fence: as the app's role, a transaction sees and writes only the
// league it set (T-61), and only its own account's personal rows (T-62).
import { randomUUID } from 'node:crypto';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newAccount,
  newLeague,
  newSeason,
  one,
  refused,
  unique,
  type MadeLeague,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

let made = 0;
const fresh = () => ++made;

// Accounts made up front, for rows written as the app, which cannot make accounts.
const spareAccounts: string[] = [];
const nextAccount = () => {
  const account = spareAccounts.pop();
  if (account === undefined) throw new Error('out of spare accounts: make more in beforeAll');
  return account;
};

type Seeded = MadeLeague & { formerSlug: string };

/** A league with at least one row in every league table, made as the owner. */
async function leagueWithEverything(): Promise<Seeded> {
  const league = await newLeague(db);
  const { leagueId, ownerId, defaultProgramId } = league;
  const formerSlug = unique('former');
  await newSeason(db, leagueId, defaultProgramId);
  await db.query(
    `insert into league_slug_history (league_id, old_slug, expires_at)
     values ($1, $2, now() + interval '1 year')`,
    [leagueId, formerSlug],
  );
  for (const table of leagueTables.filter((t) => t.table !== 'leagues' && t.table !== 'seasons')) {
    const [sql, params] = table.insert(leagueId, league);
    await db.query(sql, params);
  }
  return { ...league, formerSlug };
}

type LeagueTable = {
  table: string;
  /** The column holding the league: `id` for leagues itself. */
  key: 'id' | 'league_id';
  /** A harmless update of every row of one league. */
  touch: string;
  canDelete: boolean;
  canUpdate: boolean;
  insert: (leagueId: string, league: MadeLeague) => [string, unknown[]];
};

const leagueTables: LeagueTable[] = [
  {
    table: 'leagues',
    key: 'id',
    touch: 'update leagues set name = name where id = $1',
    canUpdate: true,
    canDelete: false,
    insert: (leagueId, { ownerId }) => [
      `insert into leagues (id, slug, name, time_zone, audience, listed, owner_account_id)
       values ($1, $2, 'Made-up League', 'UTC', 'adult', true, $3)`,
      [leagueId, unique('league'), ownerId],
    ],
  },
  {
    table: 'league_slug_history',
    key: 'league_id',
    touch: 'update league_slug_history set expires_at = expires_at where league_id = $1',
    canUpdate: true,
    canDelete: true,
    insert: (leagueId) => [
      `insert into league_slug_history (league_id, old_slug, expires_at)
       values ($1, $2, now() + interval '1 year')`,
      [leagueId, unique('former')],
    ],
  },
  {
    table: 'league_features',
    key: 'league_id',
    touch: 'update league_features set enabled = enabled where league_id = $1',
    canUpdate: true,
    canDelete: true,
    insert: (leagueId) => [
      'insert into league_features (league_id, feature_key) values ($1, $2)',
      [leagueId, `feature_${fresh()}`],
    ],
  },
  {
    table: 'programs',
    key: 'league_id',
    touch: 'update programs set name = name where league_id = $1',
    canUpdate: true,
    canDelete: true,
    insert: (leagueId) => [
      `insert into programs (league_id, slug, name, sport_key)
       values ($1, $2, 'Made-up Program', 'volleyball')`,
      [leagueId, unique('program')],
    ],
  },
  {
    table: 'seasons',
    key: 'league_id',
    touch: 'update seasons set name = name where league_id = $1',
    canUpdate: true,
    canDelete: true,
    insert: (leagueId, { defaultProgramId }) => [
      `insert into seasons (league_id, program_id, slug, name) values ($1, $2, $3, 'Made-up Season')`,
      [leagueId, defaultProgramId, unique('season')],
    ],
  },
  {
    table: 'role_grants',
    key: 'league_id',
    touch: 'update role_grants set revoked_at = revoked_at where league_id = $1',
    canUpdate: true,
    canDelete: false,
    // A new account each time, so the one-active-grant rule never answers first.
    insert: (leagueId) => [
      `insert into role_grants (league_id, account_id, role) values ($1, $2, 'editor')`,
      [leagueId, nextAccount()],
    ],
  },
  {
    table: 'invitations',
    key: 'league_id',
    touch: 'update invitations set cancelled_at = cancelled_at where league_id = $1',
    canUpdate: true,
    canDelete: false,
    insert: (leagueId) => [
      `insert into invitations (league_id, email, role, token_hash, expires_at)
       values ($1, 'invitee@example.test', 'editor', $2, now() + interval '7 days')`,
      [leagueId, fresh().toString(16).padStart(64, 'a')],
    ],
  },
  {
    table: 'activity_log',
    key: 'league_id',
    touch: 'update activity_log set summary = summary where league_id = $1',
    canUpdate: false,
    canDelete: false,
    insert: (leagueId) => [
      `insert into activity_log (league_id, action, summary) values ($1, 'league.renamed', 'Renamed')`,
      [leagueId],
    ],
  },
  {
    table: 'support_access_log',
    key: 'league_id',
    // The one column the app may change (ending a visit early).
    touch: 'update support_access_log set ended_at = ended_at where league_id = $1',
    canUpdate: true,
    canDelete: false,
    insert: (leagueId, { ownerId }) => [
      `insert into support_access_log (league_id, staff_account_id, reason, ended_at)
       values ($1, $2, 'Owner asked for help', now() + interval '1 hour')`,
      [leagueId, ownerId],
    ],
  },
  {
    table: 'command_receipts',
    key: 'league_id',
    touch: 'update command_receipts set result = result where league_id = $1',
    canUpdate: false,
    canDelete: false,
    insert: (leagueId) => [
      `insert into command_receipts (league_id, command_id, command, result)
       values ($1, $2, 'leagues.rename', '{"ok": true}')`,
      [leagueId, randomUUID()],
    ],
  },
];

const count = async (tx: Transaction | PGlite, sql: string, params: unknown[] = []) =>
  (await one<{ n: number }>(tx, `select count(*)::int as n from (${sql}) as counted`, params)).n;

let a: Seeded;
let b: Seeded;
beforeAll(async () => {
  for (let i = 0; i < 20; i++) spareAccounts.push(await newAccount(db));
  a = await leagueWithEverything();
  b = await leagueWithEverything();
});

describe('with no league set', () => {
  // Missing, empty (what a setting reads as after its transaction), not a UUID.
  const nothingSet = [{}, { league: '' }, { league: 'not-a-uuid' }, { league: "' or true --" }];

  it('every league table returns no rows', async () => {
    for (const context of nothingSet) {
      await asApp(db, context, async (tx) => {
        for (const { table } of leagueTables) {
          expect({ context, table, rows: await count(tx, `select 1 from ${table}`) }).toEqual({
            context,
            table,
            rows: 0,
          });
        }
      });
    }
  });

  it('nothing can be written', async () => {
    for (const context of [...nothingSet, { account: a.ownerId }]) {
      for (const table of leagueTables) {
        const [sql, params] = table.insert(table.key === 'id' ? randomUUID() : a.leagueId, a);
        await expect(asApp(db, context, (tx) => tx.query(sql, params))).rejects.toMatchObject(
          refused.policy,
        );
        if (table.canUpdate) {
          const { affectedRows } = await asApp(db, context, (tx) =>
            tx.query(table.touch, [a.leagueId]),
          );
          expect({ table: table.table, affectedRows }).toEqual({
            table: table.table,
            affectedRows: 0,
          });
        }
      }
    }
  });

  it('nothing can be removed', async () => {
    const before = new Map<string, number>();
    for (const { table, key } of leagueTables) {
      before.set(table, await count(db, `select 1 from ${table} where ${key} = $1`, [a.leagueId]));
    }
    for (const context of [...nothingSet, { account: a.ownerId }]) {
      for (const table of leagueTables) {
        const remove = asApp(db, context, (tx) =>
          tx.query(`delete from ${table.table} where ${table.key} = $1`, [a.leagueId]),
        );
        if (table.canDelete) {
          const { affectedRows } = await remove;
          expect({ context, table: table.table, affectedRows }).toEqual({
            context,
            table: table.table,
            affectedRows: 0,
          });
        } else {
          await expect(remove).rejects.toMatchObject(refused.privilege);
        }
      }
    }
    for (const { table, key } of leagueTables) {
      const after = await count(db, `select 1 from ${table} where ${key} = $1`, [a.leagueId]);
      expect({ table, after }).toEqual({ table, after: before.get(table) });
    }
  });

  it('a league set in one transaction is gone in the next', async () => {
    await asApp(db, { league: a.leagueId }, async (tx) => {
      expect(await count(tx, 'select 1 from programs')).toBeGreaterThan(0);
    });
    await asApp(db, {}, async (tx) => {
      expect(await count(tx, 'select 1 from programs')).toBe(0);
    });
  });
});

describe("with league A set, league B's rows", () => {
  it('are invisible, and every visible row is A', async () => {
    await asApp(db, { league: a.leagueId }, async (tx) => {
      for (const { table, key } of leagueTables) {
        const ofA = await count(tx, `select 1 from ${table} where ${key} = $1`, [a.leagueId]);
        const ofB = await count(tx, `select 1 from ${table} where ${key} = $1`, [b.leagueId]);
        const all = await count(tx, `select 1 from ${table}`);
        expect({ table, ofA: ofA > 0, ofB, all }).toEqual({ table, ofA: true, ofB: 0, all: ofA });
      }
    });
  });

  it('cannot be added to, changed or removed', async () => {
    const before = new Map<string, number>();
    for (const { table, key } of leagueTables) {
      before.set(table, await count(db, `select 1 from ${table} where ${key} = $1`, [b.leagueId]));
    }
    const asA = <T>(work: (tx: Transaction) => Promise<T>) =>
      asApp(db, { league: a.leagueId, account: a.ownerId }, work);

    for (const table of leagueTables) {
      const [sql, params] = table.insert(table.key === 'id' ? randomUUID() : b.leagueId, b);
      await expect(asA((tx) => tx.query(sql, params))).rejects.toMatchObject(refused.policy);

      const update = asA((tx) => tx.query(table.touch, [b.leagueId]));
      if (table.canUpdate) expect((await update).affectedRows).toBe(0);
      else await expect(update).rejects.toMatchObject(refused.privilege);

      const remove = asA((tx) =>
        tx.query(`delete from ${table.table} where ${table.key} = $1`, [b.leagueId]),
      );
      if (table.canDelete) expect((await remove).affectedRows).toBe(0);
      else await expect(remove).rejects.toMatchObject(refused.privilege);
    }

    for (const { table, key } of leagueTables) {
      const after = await count(db, `select 1 from ${table} where ${key} = $1`, [b.leagueId]);
      expect({ table, after }).toEqual({ table, after: before.get(table) });
    }
  });

  it("cannot be reached by moving one of A's rows to B: the fixed-column rule answers first", async () => {
    await expect(
      asApp(db, { league: a.leagueId }, (tx) =>
        tx.query('update programs set league_id = $1 where id = $2', [
          b.leagueId,
          a.defaultProgramId,
        ]),
      ),
    ).rejects.toMatchObject(refused.restrict);
  });

  it("cannot be reached by moving one of A's rows to B even without that rule (WITH CHECK)", async () => {
    // The tables the app may change the league column of, were it not fixed.
    const movable = leagueTables.filter(
      (t) => t.canUpdate && t.table !== 'support_access_log', // app_user may change ended_at only
    );
    expect(movable.length).toBeGreaterThanOrEqual(7);
    for (const table of movable) {
      const { id } = await one<{ id: string }>(
        db,
        `select id from ${table.table} where ${table.key} = $1 limit 1`,
        [a.leagueId],
      );
      const to = table.key === 'id' ? randomUUID() : b.leagueId;
      // As the owner, the rule that fixes the league column is switched off for this
      // transaction only; the failed update below undoes it with everything else.
      const move = db.transaction(async (tx) => {
        await tx.exec(`alter table public.${table.table} disable trigger ${table.table}_on_update`);
        await tx.query('set local role app_user');
        await tx.query("select set_config('app.league_id', $1, true)", [a.leagueId]);
        return tx.query(`update ${table.table} set ${table.key} = $1 where id = $2`, [to, id]);
      });
      await expect(move).rejects.toMatchObject(refused.policy);
    }
    const { off } = await one<{ off: number }>(
      db,
      `select count(*)::int as off from pg_trigger
       where tgname like '%\\_on\\_update' and tgenabled = 'D'`,
    );
    expect(off).toBe(0);
  });

  it("while A's own rows can be added, changed and removed as granted", async () => {
    await asApp(db, { league: a.leagueId }, async (tx) => {
      for (const table of leagueTables.filter((t) => t.key === 'league_id')) {
        const [sql, params] = table.insert(a.leagueId, a);
        const { rows } = await tx.query<{ id: string }>(`${sql} returning id`, params);
        const id = rows[0]?.id;
        expect(id).toBeDefined();
        if (table.canUpdate) {
          expect((await tx.query(table.touch, [a.leagueId])).affectedRows).toBeGreaterThan(0);
        }
        if (table.canDelete) {
          const removed = await tx.query(`delete from ${table.table} where id = $1`, [id]);
          expect(removed.affectedRows).toBe(1);
        }
      }
      expect((await tx.query(leagueTables[0]!.touch, [a.leagueId])).affectedRows).toBe(1);
    });
  });
});

describe('rules that look across leagues still hold through the fence', () => {
  it('the app creates a league by choosing its id, then the league and its default program', async () => {
    const owner = await newAccount(db);
    const id = randomUUID();
    await asApp(db, { league: id, account: owner }, async (tx) => {
      const [sql, params] = leagueTables[0]!.insert(id, {
        leagueId: id,
        ownerId: owner,
        defaultProgramId: '',
      });
      await tx.query(sql, params);
      await tx.query(
        `insert into programs (league_id, slug, name, sport_key, is_default)
         values ($1, 'main', 'Main', 'basketball', true)`,
        [id],
      );
    });
    expect(await count(db, 'select 1 from leagues where id = $1', [id])).toBe(1);
  });

  it('a league without a default program is refused, even if the league set changes', async () => {
    const owner = await newAccount(db);
    const id = randomUUID();
    await expect(
      asApp(db, { league: id }, async (tx) => {
        const [sql, params] = leagueTables[0]!.insert(id, {
          leagueId: id,
          ownerId: owner,
          defaultProgramId: '',
        });
        await tx.query(sql, params);
        await tx.query("select set_config('app.league_id', $1, true)", [a.leagueId]);
      }),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'leagues_have_default_program' });
  });

  it('a short name still forwarding to league B cannot be taken by A, though A cannot see B', async () => {
    await expect(
      asApp(db, { league: a.leagueId }, (tx) =>
        tx.query('update leagues set slug = $1 where id = $2', [b.formerSlug, a.leagueId]),
      ),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'leagues_slug_not_forwarding' });
    const bSlug = (
      await one<{ slug: string }>(db, 'select slug from leagues where id = $1', [b.leagueId])
    ).slug;
    await expect(
      asApp(db, { league: a.leagueId }, (tx) =>
        tx.query(
          `insert into league_slug_history (league_id, old_slug, expires_at)
           values ($1, $2, now() + interval '1 year')`,
          [a.leagueId, bSlug],
        ),
      ),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'league_slug_history_slug_free' });
  });
});

describe('finding a league by the short name in an address, before any league is set', () => {
  const find = (slug: string) =>
    asApp(db, {}, (tx) =>
      tx.query<Record<string, unknown>>('select * from public.find_league_by_slug($1)', [slug]),
    );

  it('finds a current or still-forwarding name, and only those columns', async () => {
    const slug = (
      await one<{ slug: string }>(db, 'select slug from leagues where id = $1', [a.leagueId])
    ).slug;
    expect((await find(slug)).rows).toEqual([
      { league_id: a.leagueId, slug, status: 'draft', in_bin: false, forwarded: false },
    ]);
    expect((await find(b.formerSlug)).rows).toEqual([
      expect.objectContaining({ league_id: b.leagueId, forwarded: true }),
    ]);
  });

  it('finds nothing for an unknown name or an expired forward', async () => {
    const expired = unique('expired');
    await db.query(
      `insert into league_slug_history (league_id, old_slug, created_at, expires_at)
       values ($1, $2, now() - interval '2 years', now() - interval '1 year')`,
      [b.leagueId, expired],
    );
    expect((await find(expired)).rows).toEqual([]);
    expect((await find('no-such-league')).rows).toEqual([]);
  });
});

describe('personal tables are fenced by account (T-62)', () => {
  let x: string;
  let y: string;
  let xSelf: string;
  let xChild: string;
  let ySelf: string;
  beforeAll(async () => {
    x = await newAccount(db);
    y = await newAccount(db);
    const profile = async (account: string, relation: string) => {
      const { id } = await one<{ id: string }>(
        db,
        `insert into profiles (first_name, last_name) values ('Made', 'Up') returning id`,
      );
      await db.query(
        'insert into profile_access (account_id, profile_id, relation) values ($1, $2, $3)',
        [account, id, relation],
      );
      return id;
    };
    xSelf = await profile(x, 'self');
    xChild = await profile(x, 'guardian');
    ySelf = await profile(y, 'self');
  });

  const ids = async (tx: Transaction, sql: string) =>
    (await tx.query<{ id: string }>(sql)).rows.map((r) => r.id).sort();

  it('an account sees its own account, its access rows and the profiles they name', async () => {
    await asApp(db, { account: x, league: a.leagueId }, async (tx) => {
      expect(await ids(tx, 'select id from accounts')).toEqual([x]);
      expect(await ids(tx, 'select id from profiles')).toEqual([xSelf, xChild].sort());
      expect(await ids(tx, 'select account_id as id from profile_access')).toEqual([x, x]);
    });
  });

  it("an account cannot change another's rows, and creates none here", async () => {
    await asApp(db, { account: x }, async (tx) => {
      const rename = "update accounts set display_name = 'Changed' where id = $1";
      expect((await tx.query(rename, [y])).affectedRows).toBe(0);
      expect((await tx.query(rename, [x])).affectedRows).toBe(1);
      const renameProfile = "update profiles set first_name = 'Changed' where id = $1";
      expect((await tx.query(renameProfile, [ySelf])).affectedRows).toBe(0);
      expect((await tx.query(renameProfile, [xChild])).affectedRows).toBe(1);
    });
    for (const sql of [
      "insert into accounts (email) values ('new@example.test')",
      "insert into profiles (first_name, last_name) values ('New', 'Person')",
      `insert into profile_access (account_id, profile_id, relation) values ('${x}', '${ySelf}', 'guardian')`,
      `delete from accounts where id = '${x}'`,
    ]) {
      await expect(asApp(db, { account: x }, (tx) => tx.query(sql))).rejects.toMatchObject(
        refused.privilege,
      );
    }
  });

  it('with no account set, nothing personal is visible', async () => {
    for (const context of [{}, { account: '' }, { account: 'nobody' }, { league: a.leagueId }]) {
      await asApp(db, context, async (tx) => {
        for (const table of ['accounts', 'profiles', 'profile_access']) {
          expect({ table, rows: await count(tx, `select 1 from ${table}`) }).toEqual({
            table,
            rows: 0,
          });
        }
      });
    }
  });
});
