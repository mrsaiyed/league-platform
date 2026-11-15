// Migration 0017 (step 2.150, record 063): the platform log, and the owner-run
// functions that remove a draft league made by mistake. What the database itself
// promises, whoever calls it; the tool's own run is in league-making/remove-league.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { asApp, freshSchema, newAccount, newLeague, one, refused } from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const migrations = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
const migrationText = () => {
  const file = readdirSync(migrations).find((name) =>
    name.endsWith('_removing_a_draft_league.sql'),
  );
  if (file === undefined) throw new Error('the removal migration is missing');
  return readFileSync(path.join(migrations, file), 'utf8');
};

/** A league as the tool leaves it: draft, default program, current season, two log rows. */
async function makerShaped(sql: PGlite = db) {
  const league = await newLeague(sql);
  const staff = await newAccount(sql);
  const season = await one<{ id: string }>(
    sql,
    `insert into seasons (league_id, program_id, slug, name) values ($1, $2, 'fall', 'Fall')
     returning id`,
    [league.leagueId, league.defaultProgramId],
  );
  await sql.query('update seasons set is_current = true where id = $1', [season.id]);
  for (const action of ['leagues.create', 'leagues.create_season']) {
    await sql.query(
      `insert into activity_log (league_id, actor_account_id, action, summary)
       values ($1, $2, $3, $4)`,
      [league.leagueId, staff, action, `activity.${action}`],
    );
  }
  const { rows } = await sql.query<{ slug: string }>('select slug from leagues where id = $1', [
    league.leagueId,
  ]);
  return { ...league, staff, seasonId: season.id, slug: rows[0]?.slug ?? '' };
}

/** Runs `work` as the tables' owner in a transaction set to `league` and `account`. */
function setTo<T>(
  league: string | null,
  account: string | null,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(
      "select set_config('app.league_id', $1, true), set_config('app.account_id', $2, true)",
      [league ?? '', account ?? ''],
    );
    return work(tx);
  });
}

/** Every ordinary table with a league_id column, from the catalog, but the platform log. */
const leagueTablesIn = async (sql: PGlite | Transaction) =>
  (
    await sql.query<{ name: string }>(
      `select n.nspname || '.' || c.relname as name
       from pg_attribute a join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'league_id' and a.attnum > 0 and not a.attisdropped
         and c.relkind in ('r', 'p') and not c.relispartition
         and n.nspname <> 'information_schema' and n.nspname not like 'pg\\_%'
       order by 1`,
    )
  ).rows.map((r) => r.name);

/** The tables league_rows counts. */
const countedIn = async (sql: PGlite | Transaction, league: string) =>
  (
    await sql.query<{ table_name: string }>(
      'select table_name from public.league_rows($1) order by 1',
      [league],
    )
  ).rows.map((r) => r.table_name);

/** Tables with a league_id column that league_rows does not count, and the other way. */
async function uncounted(sql: PGlite | Transaction, league: string) {
  const tables = await leagueTablesIn(sql);
  const counted = await countedIn(sql, league);
  return {
    notCounted: tables.filter((t) => !counted.includes(t)),
    notATable: counted.filter((t) => !tables.includes(t)),
  };
}

describe('league_rows counts every league table (a table added later cannot be forgotten)', () => {
  it('names exactly the tables with a league_id column the catalog has', async () => {
    const league = await makerShaped();
    expect(await uncounted(db, league.leagueId)).toEqual({ notCounted: [], notATable: [] });
    expect((await leagueTablesIn(db)).length).toBeGreaterThanOrEqual(32);
  });

  it('fails when a new table with a league_id column is not named in it', async () => {
    const league = await makerShaped();
    const found = await db.transaction(async (tx) => {
      await tx.exec('create table public.planted (id uuid primary key, league_id uuid)');
      const result = await uncounted(tx, league.leagueId);
      await tx.rollback();
      return result;
    });
    expect(found).toEqual({ notCounted: ['public.planted'], notATable: [] });
  });

  it('every league_id links to the league, so the lock on its row holds back every new row', async () => {
    const { rows } = await db.query<{ name: string }>(
      `select n.nspname || '.' || c.relname as name
       from pg_attribute a join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'league_id' and a.attnum > 0 and not a.attisdropped
         and c.relkind in ('r', 'p') and n.nspname = 'public'
         and not exists (
           select 1 from pg_constraint k
           where k.conrelid = c.oid and k.contype = 'f'
             and k.confrelid = 'public.leagues'::regclass
             and k.conkey = array[a.attnum]
         )
       order by 1`,
    );
    expect(rows).toEqual([]);
    const { rows: elsewhere } = await db.query<{ name: string }>(
      `select k.conrelid::regclass::text as name from pg_constraint k
       where k.contype = 'f'
         and k.confrelid in ('public.leagues'::regclass, 'public.programs'::regclass,
                             'public.seasons'::regclass)
         and not exists (select 1 from pg_attribute a
                         where a.attrelid = k.conrelid and a.attname = 'league_id'
                           and not a.attisdropped)
       order by 1`,
    );
    // Every link into a league's rows comes from a table league_rows counts.
    expect(elsewhere).toEqual([]);
  });

  it('remove_draft_league locks the league row before it checks', async () => {
    const { definition } = await one<{ definition: string }>(
      db,
      "select pg_get_functiondef('public.remove_draft_league(uuid,text,uuid)'::regprocedure) as definition",
    );
    const lock = definition.indexOf('for update');
    const check = definition.indexOf('found_problems := public.league_removal_problems');
    expect(lock).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(lock);
  });
});

describe('remove_draft_league (0017)', () => {
  it('removes a maker-shaped league with its two log rows, its season and program, and logs it', async () => {
    const league = await makerShaped();
    const result = await setTo(league.leagueId, league.staff, (tx) =>
      one<{ outcome: string; entry_id: string }>(
        tx,
        'select outcome, entry_id::text as entry_id from public.remove_draft_league($1, $2, $3)',
        [league.leagueId, league.slug, league.staff],
      ),
    );
    expect(result.outcome).toBe('removed');
    expect(
      await one(db, `select coalesce(sum(row_count), 0)::int as n from public.league_rows($1)`, [
        league.leagueId,
      ]),
    ).toEqual({ n: 0 });
    expect(
      await one(
        db,
        `select action, removed_league_id::text as league, league_slug, actor_account_id::text as actor
         from platform.activity_log where id = $1`,
        [result.entry_id],
      ),
    ).toEqual({
      action: 'leagues.remove_draft',
      league: league.leagueId,
      league_slug: league.slug,
      actor: league.staff,
    });
  });

  it('acts only on the league and account the transaction is set to (the fence the other way)', async () => {
    const league = await makerShaped();
    const other = await makerShaped();
    for (const [setLeague, setAccount] of [
      [other.leagueId, league.staff],
      [null, league.staff],
      [league.leagueId, null],
      [league.leagueId, other.staff],
    ] as const) {
      await expect(
        setTo(setLeague, setAccount, (tx) =>
          tx.query('select * from public.remove_draft_league($1, $2, $3)', [
            league.leagueId,
            league.slug,
            league.staff,
          ]),
        ),
      ).rejects.toMatchObject(refused.privilege);
    }
    expect(
      await one(db, 'select count(*)::int as n from leagues where id = any($1)', [
        [league.leagueId, other.leagueId],
      ]),
    ).toEqual({ n: 2 });
  });

  it('puts the history rule back at once: the rest of the transaction may not delete history', async () => {
    const league = await makerShaped();
    const kept = await makerShaped();
    await expect(
      setTo(league.leagueId, league.staff, async (tx) => {
        await tx.query('select * from public.remove_draft_league($1, $2, $3)', [
          league.leagueId,
          league.slug,
          league.staff,
        ]);
        const setting = await one<{ value: string }>(
          tx,
          "select coalesce(current_setting('srleagues.history_purge', true), '') as value",
        );
        expect(setting.value).toBe('');
        await tx.query('delete from activity_log where league_id = $1', [kept.leagueId]);
      }),
    ).rejects.toMatchObject(refused.restrict);
    // The whole transaction rolled back: the first league is still there too.
    expect(
      await one(db, 'select count(*)::int as n from activity_log where league_id = any($1)', [
        [league.leagueId, kept.leagueId],
      ]),
    ).toEqual({ n: 4 });
  });

  it('refuses a role that row-level security still fences: it would count too few rows', async () => {
    const league = await makerShaped();
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`
          create role fenced_remover nosuperuser nobypassrls;
          grant usage on schema public, platform to fenced_remover;
          grant execute on function public.league_rows(uuid), public.league_removal_problems(uuid),
            public.require_view_of_every_league() to fenced_remover;
          set local role fenced_remover;
        `);
        await tx.query('select public.league_removal_problems($1)', [league.leagueId]);
      }),
    ).rejects.toMatchObject({
      ...refused.privilege,
      message: expect.stringContaining('fenced by row-level security'),
    });
  });
});

describe('the platform log (0017)', () => {
  it('is history: no row is ever changed or removed, even by the owner with the purge setting', async () => {
    const league = await makerShaped();
    const { entry_id: entry } = await setTo(league.leagueId, league.staff, (tx) =>
      one<{ entry_id: string }>(
        tx,
        'select entry_id::text as entry_id from public.remove_draft_league($1, $2, $3)',
        [league.leagueId, league.slug, league.staff],
      ),
    );
    for (const change of [
      "update platform.activity_log set league_name = 'Changed' where id = $1",
      'delete from platform.activity_log where id = $1',
    ]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.query("select set_config('srleagues.history_purge', $1, true)", [
            league.leagueId,
          ]);
          await tx.query(change, [entry]);
        }),
      ).rejects.toMatchObject(refused.restrict);
    }
    expect(
      await one(db, 'select count(*)::int as n from platform.activity_log where id = $1', [entry]),
    ).toEqual({ n: 1 });
  });

  it('is out of the app’s reach, and so are the removal functions', async () => {
    const league = await makerShaped();
    const context = { league: league.leagueId, account: league.staff };
    for (const statement of [
      'select * from platform.activity_log',
      `select public.league_rows('${league.leagueId}')`,
      `select public.league_removal_problems('${league.leagueId}')`,
      `select * from public.remove_draft_league('${league.leagueId}', '${league.slug}', '${league.staff}')`,
      `delete from leagues where id = '${league.leagueId}'`,
    ]) {
      await expect(asApp(db, context, (tx) => tx.query(statement))).rejects.toMatchObject(
        refused.privilege,
      );
    }
    expect(
      await one(
        db,
        `select has_schema_privilege('app_user', 'platform', 'USAGE') as schema,
                has_table_privilege('app_user', 'platform.activity_log',
                  'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as tbl`,
      ),
    ).toEqual({ schema: false, tbl: false });
  });
});

describe('league_removal_problems: a season exactly as the maker leaves it', () => {
  it('passes the maker’s season (made, then made current: version 2) and nothing else', async () => {
    const league = await makerShaped();
    expect(
      await one(db, 'select version, is_current from seasons where id = $1', [league.seasonId]),
    ).toEqual({ version: 2, is_current: true });
    expect(
      await one(db, 'select public.league_removal_problems($1) as problems', [league.leagueId]),
    ).toEqual({ problems: [] });
  });

  it('refuses a season that is not current, even one changed only once', async () => {
    // Made, never made current, renamed once: version 2 but not the maker's.
    const league = await newLeague(db);
    const staff = await newAccount(db);
    const season = await one<{ id: string }>(
      db,
      `insert into seasons (league_id, program_id, slug, name) values ($1, $2, 'fall', 'Fall')
       returning id`,
      [league.leagueId, league.defaultProgramId],
    );
    await db.query("update seasons set name = 'Renamed' where id = $1", [season.id]);
    await db.query(
      `insert into activity_log (league_id, actor_account_id, action, summary)
       values ($1, $2, 'leagues.create', 'activity.leagues.create')`,
      [league.leagueId, staff],
    );
    expect(
      await one(db, 'select version, is_current from seasons where id = $1', [season.id]),
    ).toEqual({ version: 2, is_current: false });
    expect(
      await one(db, 'select public.league_removal_problems($1) as problems', [league.leagueId]),
    ).toEqual({ problems: ['season-changed'] });
  });
});

describe("Supabase's API roles get nothing in the platform schema (T-64)", () => {
  it('even with default privileges granted everywhere, not only in public', async () => {
    const hosted = new PGlite();
    try {
      await hosted.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        grant usage on schema public to anon, authenticated, service_role;
        alter default privileges grant all on tables to anon, authenticated, service_role;
      `);
      const run = await applyMigrations(pgliteDriver(hosted));
      expect(run.ok).toBe(true);
      const { rows } = await hosted.query<{ role: string; what: string }>(
        `select r.rolname as role, t.relname as what
         from pg_roles r cross join pg_class t
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and t.relnamespace = 'platform'::regnamespace and t.relkind in ('r', 'p')
           and has_table_privilege(r.oid, t.oid,
                 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         union all
         select r.rolname, 'schema platform'
         from pg_roles r
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and has_schema_privilege(r.oid, 'platform', 'USAGE')`,
      );
      expect(rows).toEqual([]);
    } finally {
      await hosted.close();
    }
  });
});

describe('migration 0017 runs twice', () => {
  it('applies again over itself without error, and still works', async () => {
    await db.exec(migrationText());
    const league = await makerShaped();
    expect(
      await one(db, 'select public.league_removal_problems($1) as problems', [league.leagueId]),
    ).toEqual({ problems: [] });
  });
});
