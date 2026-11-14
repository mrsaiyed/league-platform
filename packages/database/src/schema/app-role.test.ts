// T-60 and T-64: what the app's role may and may not do, and the gate that keeps
// every future table behind row-level security.
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import {
  asApp,
  freshSchema,
  newLeague,
  one,
  refused,
  unique,
  type MadeLeague,
} from './schema.test-helper.ts';

let db: PGlite;
let league: MadeLeague;
beforeAll(async () => {
  db = await freshSchema();
  league = await newLeague(db);
});
afterAll(async () => {
  await db.close();
});

/** Tables that belong to a person, not a league (T-62). Every other table is a league table. */
const personalTables = ['accounts', 'profiles', 'profile_access'];
const historyTables = [
  'activity_log',
  'command_receipts',
  'support_access_log',
  'schedule_revisions',
  'game_corrections',
  'game_events',
];
/**
 * The only functions that run as their owner, each reviewed (T-221, records 008, 012
 * and 052). Step 2.92 added the account functions: account_of_sign_in (one sign-in
 * id, returns an account id only), account_for_sign_in (after the sign-in service
 * proved the mailbox; returns an id, never says whether it found or made it),
 * create_own_profile and erase_account (only the account set for the transaction),
 * and access_list_names (display names on the set league's access list only).
 */
const definerFunctions = [
  'access_list_names',
  'account_for_sign_in',
  'account_of_sign_in',
  'check_league_has_default_program',
  'check_league_slug_free',
  'check_old_slug_free',
  'create_own_profile',
  'erase_account',
  'find_league_by_slug',
  'take_jobs',
];
/** The sign-in store's tables (record 052): schema sign_in, reached only by sign_in_store. */
const signInTables = [
  'code_requests',
  'codes',
  'devices',
  'guess_locks',
  'guesses',
  'proofs',
  'refresh_tokens',
  'sessions',
  'users',
];

const publicTables = async (sql: PGlite) =>
  (
    await sql.query<{ name: string }>(
      `select c.relname as name from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       order by 1`,
    )
  ).rows.map((r) => r.name);

const roleAttributes = (sql: PGlite) =>
  one(
    sql,
    `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
     from pg_roles where rolname = 'app_user'`,
  );
const noPowers = {
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolcanlogin: false,
};

describe('the app role (T-60)', () => {
  it('cannot log in by itself, is no superuser and cannot bypass row-level security', async () => {
    expect(await roleAttributes(db)).toEqual(noPowers);
  });

  it('is put right if it already exists with powers it must not have', async () => {
    // A role belongs to the whole server, so another database there may have made it.
    for (const made of [
      'create role app_user nologin',
      'create role app_user login superuser createdb createrole replication bypassrls',
    ]) {
      const server = new PGlite();
      try {
        await server.exec(made);
        const run = await applyMigrations(pgliteDriver(server));
        expect({ made, ok: run.ok }).toEqual({ made, ok: true });
        expect(await roleAttributes(server)).toEqual(noPowers);
      } finally {
        await server.close();
      }
    }
  });

  it('stops the migration if it already exists as a member of another role', async () => {
    const server = new PGlite();
    try {
      await server.exec(`
        create role powerful nologin bypassrls;
        create role app_user nologin;
        grant powerful to app_user;
      `);
      const run = await applyMigrations(pgliteDriver(server));
      expect(run.ok).toBe(false);
      if (!run.ok) expect(run.error.message).toContain('member of another role');
    } finally {
      await server.close();
    }
  });

  it('owns nothing and can create nothing', async () => {
    const owned = await one<{ n: number }>(
      db,
      `select ((select count(*) from pg_class where relowner = 'app_user'::regrole)
             + (select count(*) from pg_proc where proowner = 'app_user'::regrole)
             + (select count(*) from pg_namespace where nspowner = 'app_user'::regrole))::int as n`,
    );
    expect(owned.n).toBe(0);
    for (const sql of [
      'create table public.made_by_app (id int)',
      'create function public.made_by_app() returns int language sql as $$ select 1 $$',
      'create schema made_by_app',
    ]) {
      await expect(asApp(db, {}, (tx) => tx.query(sql))).rejects.toMatchObject(refused.privilege);
    }
  });

  it('cannot change the schema or switch the fence off', async () => {
    const asOwnLeague = (sql: string) =>
      asApp(db, { league: league.leagueId }, (tx) => tx.exec(sql));
    for (const sql of [
      'drop table public.activity_log',
      'alter table public.leagues add column extra text',
      'alter table public.leagues disable row level security',
      'alter table public.leagues no force row level security',
      'create policy everything on public.leagues using (true)',
      'drop policy leagues_league_fence on public.leagues',
      'create index on public.leagues (name)',
    ]) {
      await expect(asOwnLeague(sql)).rejects.toMatchObject(refused.privilege);
    }
    // Turning row-level security off for the session refuses the query instead.
    await expect(
      asOwnLeague('set local row_security = off; select * from public.leagues'),
    ).rejects.toMatchObject(refused.privilege);
  });

  it('never has TRUNCATE, REFERENCES or TRIGGER on any table (T3 §12)', async () => {
    for (const table of await publicTables(db)) {
      for (const privilege of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const { has } = await one<{ has: boolean }>(
          db,
          `select has_table_privilege('app_user', $1, $2) as has`,
          [`public.${table}`, privilege],
        );
        expect({ table, privilege, has }).toEqual({ table, privilege, has: false });
      }
    }
    await expect(
      asApp(db, { league: league.leagueId }, (tx) => tx.query('truncate public.activity_log')),
    ).rejects.toMatchObject(refused.privilege);
  });

  it('can only add to history, never change or remove it (T-45)', async () => {
    for (const table of historyTables) {
      const { update, remove } = await one<{ update: boolean; remove: boolean }>(
        db,
        `select has_table_privilege('app_user', $1, 'UPDATE') as update,
                has_table_privilege('app_user', $1, 'DELETE') as remove`,
        [`public.${table}`],
      );
      expect({ table, update, remove }).toEqual({ table, update: false, remove: false });
    }
    // A support visit can be ended early: that one column, which its trigger guards.
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
       where grantee = 'app_user' and table_name = 'support_access_log' and privilege_type = 'UPDATE'`,
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual(['ended_at']);
  });

  it('may change only the name, phone and last-seen time of its own account (R9, T-73)', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
       where grantee = 'app_user' and table_name = 'accounts' and privilege_type = 'UPDATE'
       order by 1`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(['display_name', 'last_seen_at', 'phone']);
    const { tableWide } = await one<{ tableWide: boolean }>(
      db,
      `select exists (
         select 1 from information_schema.table_privileges
         where grantee = 'app_user' and table_name = 'accounts' and privilege_type = 'UPDATE'
       ) as "tableWide"`,
    );
    expect(tableWide).toBe(false);
    const own = league.ownerId;
    await asApp(db, { account: own }, async (tx) => {
      const renamed = await tx.query("update accounts set display_name = 'Renamed' where id = $1", [
        own,
      ]);
      expect(renamed.affectedRows).toBe(1);
    });
    for (const sql of [
      "update accounts set email = 'elsewhere@example.test'",
      "update accounts set sign_in_id = 'someone-else'",
      'update accounts set version = 99',
    ]) {
      await expect(asApp(db, { account: own }, (tx) => tx.query(sql))).rejects.toMatchObject(
        refused.privilege,
      );
    }
  });

  it('cannot reach the sign-in store, which reaches nothing of the app (record 052)', async () => {
    const { appReaches } = await one<{ appReaches: string[] }>(
      db,
      `select coalesce(array_agg(t.tablename::text order by 1), '{}') as "appReaches"
       from pg_tables t
       where t.schemaname = 'sign_in'
         and has_table_privilege('app_user', format('%I.%I', t.schemaname, t.tablename),
               'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
    );
    expect(appReaches).toEqual([]);
    const { storeReaches } = await one<{ storeReaches: string[] }>(
      db,
      `select coalesce(array_agg(t.tablename::text order by 1), '{}') as "storeReaches"
       from pg_tables t
       where t.schemaname = 'public'
         and has_table_privilege('sign_in_store', format('%I.%I', t.schemaname, t.tablename),
               'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
    );
    expect(storeReaches).toEqual([]);
    const usage = await one<{ app: boolean; store: boolean }>(
      db,
      `select has_schema_privilege('app_user', 'sign_in', 'USAGE') as app,
              has_schema_privilege('sign_in_store', 'public', 'USAGE') as store`,
    );
    expect(usage).toEqual({ app: false, store: false });
    const store = await one(
      db,
      `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
       from pg_roles where rolname = 'sign_in_store'`,
    );
    expect(store).toEqual(noPowers);
    await expect(
      asApp(db, {}, (tx) => tx.query('select * from sign_in.sessions')),
    ).rejects.toMatchObject(refused.privilege);
  });

  it('cannot purge history, and nothing in public is open to everyone (record 007, T-64)', async () => {
    await expect(
      asApp(db, { league: league.leagueId }, (tx) =>
        tx.query('select public.purge_league_history($1)', [league.leagueId]),
      ),
    ).rejects.toMatchObject(refused.privilege);
    const { rows } = await db.query<{ name: string }>(
      `select p.oid::regprocedure::text as name
       from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.pronamespace = 'public'::regnamespace and acl.grantee = 0`,
    );
    expect(rows).toEqual([]);
  });
});

/** A policy test as PostgreSQL prints it with every name in full (search_path empty). */
const keyedTo = (column: string, setting: 'current_account_id' | 'current_league_id') =>
  `(${column} = ( SELECT public.${setting}() AS ${setting}))`;

/**
 * The one policy each table may have, used for reading (USING) and writing (WITH
 * CHECK) alike. A table not named here is a league table and must be fenced on its
 * league_id; a personal table must be named here with its own test (T-62).
 */
const expectedFences: Record<string, string> = {
  accounts: keyedTo('id', 'current_account_id'),
  profile_access: keyedTo('account_id', 'current_account_id'),
  profiles:
    '(EXISTS ( SELECT 1\n   FROM public.profile_access pa\n' +
    `  WHERE ((pa.profile_id = profiles.id) AND ${keyedTo('pa.account_id', 'current_account_id')})))`,
  leagues: keyedTo('id', 'current_league_id'),
};
const leagueFence = keyedTo('league_id', 'current_league_id');

type Policy = {
  schema: string;
  table: string;
  name: string;
  permissive: string;
  roles: string[];
  command: string;
  using: string | null;
  check: string | null;
};

/**
 * Everything wrong with the fence, as sentences; empty when every table is right.
 * Run inside a transaction: it empties search_path for that transaction, so policy
 * tests print the same whatever the connection's search path is.
 */
async function fenceProblems(tx: Transaction): Promise<string[]> {
  await tx.query("set local search_path = ''");
  const { rows: tables } = await tx.query<{
    name: string;
    enabled: boolean;
    forced: boolean;
    league_id: boolean;
  }>(
    `select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
            exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'league_id' and not a.attisdropped
                   ) as league_id
     from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`,
  );
  // Every schema but PostgreSQL's own, so a policy added anywhere is seen.
  const { rows: policies } = await tx.query<Policy>(
    `select schemaname as schema, tablename as table, policyname as name, permissive,
            roles::text[] as roles, cmd as command, qual as using, with_check as check
     from pg_policies
     where schemaname <> 'information_schema' and schemaname not like 'pg\\_%'`,
  );
  const { rows: schemas } = await tx.query<{ name: string }>(
    `select nspname as name from pg_namespace
     where has_schema_privilege('app_user', oid, 'USAGE')
       and nspname <> 'information_schema' and nspname not like 'pg\\_%'`,
  );

  const { rows: storeTables } = await tx.query<{
    name: string;
    enabled: boolean;
    forced: boolean;
  }>(
    `select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
     from pg_class c
     where c.relnamespace = 'sign_in'::regnamespace and c.relkind in ('r', 'p')`,
  );

  const problems: string[] = [];
  if (tables.length < 13) problems.push(`only ${tables.length} tables found in public`);
  for (const schema of schemas) {
    if (schema.name !== 'public') problems.push(`app_user may use schema ${schema.name}`);
  }
  const names = new Set(tables.map((t) => t.name));
  const storeNames = new Set(storeTables.map((t) => t.name));
  for (const policy of policies) {
    const onPublic = policy.schema === 'public' && names.has(policy.table);
    const onStore = policy.schema === 'sign_in' && storeNames.has(policy.table);
    if (!onPublic && !onStore) {
      problems.push(`${policy.schema}.${policy.table}.${policy.name} is not on a public table`);
    }
  }
  // The sign-in store's tables (record 052): forced, with one policy for its role only.
  const found = storeTables.map((t) => t.name).sort();
  if (found.join(',') !== signInTables.join(',')) {
    problems.push(`sign_in has tables ${found.join(', ')}, not ${signInTables.join(', ')}`);
  }
  for (const table of storeTables) {
    const where = `sign_in.${table.name}`;
    if (!table.enabled || !table.forced) {
      problems.push(`${where}: row-level security must be enabled and forced`);
    }
    const own = policies.filter((p) => p.schema === 'sign_in' && p.table === table.name);
    if (own.length !== 1)
      problems.push(`${where} must have exactly one policy, and has ${own.length}`);
    for (const policy of own) {
      if (policy.permissive !== 'PERMISSIVE') problems.push(`${where} must be PERMISSIVE`);
      if (policy.command !== 'ALL') problems.push(`${where} must apply to ALL commands`);
      if (policy.roles.join(',') !== 'sign_in_store') {
        problems.push(`${where} must apply to sign_in_store only`);
      }
      if (policy.using !== 'true' || policy.check !== 'true') {
        problems.push(`${where} must let sign_in_store reach every row and no one else`);
      }
    }
  }
  for (const table of tables) {
    const personal = personalTables.includes(table.name);
    if (!personal && !table.league_id && table.name !== 'leagues') {
      problems.push(`${table.name} has no league_id and is not listed as a personal table`);
    }
    if (personal && expectedFences[table.name] === undefined) {
      problems.push(`${table.name} is personal but has no expected policy in this test`);
    }
    if (!table.enabled || !table.forced) {
      problems.push(`${table.name}: row-level security must be enabled and forced`);
    }
    const own = policies.filter((p) => p.schema === 'public' && p.table === table.name);
    if (own.length !== 1) {
      problems.push(`${table.name} must have exactly one policy, and has ${own.length}`);
    }
    const expected = expectedFences[table.name] ?? leagueFence;
    for (const policy of own) {
      const where = `${table.name}.${policy.name}`;
      if (policy.permissive !== 'PERMISSIVE') problems.push(`${where} must be PERMISSIVE`);
      if (policy.command !== 'ALL') problems.push(`${where} must apply to ALL commands`);
      if (policy.roles.join(',') !== 'public') problems.push(`${where} must apply to every role`);
      if (policy.using !== expected) problems.push(`${where} USING is ${policy.using}`);
      if (policy.check !== expected) problems.push(`${where} WITH CHECK is ${policy.check}`);
    }
  }
  return problems;
}

/** Plants something in a transaction that is then undone, and returns the gate's verdict. */
const plantedProblems = (planted: string) =>
  db.transaction(async (tx) => {
    await tx.exec(planted);
    const problems = await fenceProblems(tx);
    await tx.rollback();
    return problems;
  });

describe('every table is behind row-level security (gate for future tables)', () => {
  it('is enabled and forced, with exactly one policy keyed to the league or the account', async () => {
    expect(await db.transaction(fenceProblems)).toEqual([]);
  });

  it('fails when something would widen or weaken the fence', async () => {
    const plants: [string, string][] = [
      [
        'create policy extra on public.programs using (public.current_league_id() is null)',
        'programs must have exactly one policy, and has 2',
      ],
      [
        `drop policy seasons_league_fence on public.seasons;
         create policy seasons_league_fence on public.seasons
           using (league_id = (select public.current_league_id()) or true)
           with check (league_id = (select public.current_league_id()))`,
        'seasons.seasons_league_fence USING is',
      ],
      [
        `drop policy invitations_league_fence on public.invitations;
         create policy invitations_league_fence on public.invitations
           using (league_id = (select public.current_league_id()))`,
        'invitations.invitations_league_fence WITH CHECK is',
      ],
      [
        `drop policy role_grants_league_fence on public.role_grants;
         create policy role_grants_league_fence on public.role_grants as restrictive
           using (league_id = (select public.current_league_id()))
           with check (league_id = (select public.current_league_id()))`,
        'role_grants.role_grants_league_fence must be PERMISSIVE',
      ],
      [
        `drop policy accounts_own_account on public.accounts;
         create policy accounts_own_account on public.accounts
           using (id = (select public.current_league_id()))
           with check (id = (select public.current_league_id()))`,
        'accounts.accounts_own_account USING is',
      ],
      [
        'alter table public.league_features no force row level security',
        'league_features: row-level security must be enabled and forced',
      ],
      [
        `create table public.planted (id uuid primary key, league_id uuid);
         alter table public.planted enable row level security;
         alter table public.planted force row level security`,
        'planted must have exactly one policy, and has 0',
      ],
      [
        `create table migration_log.planted (id int);
         alter table migration_log.planted enable row level security;
         create policy planted on migration_log.planted using (true)`,
        'migration_log.planted.planted is not on a public table',
      ],
      ['grant usage on schema migration_log to app_user', 'app_user may use schema migration_log'],
      ['grant usage on schema sign_in to app_user', 'app_user may use schema sign_in'],
      [
        'alter table sign_in.proofs no force row level security',
        'sign_in.proofs: row-level security must be enabled and forced',
      ],
      [
        `drop policy sessions_store_only on sign_in.sessions;
         create policy sessions_store_only on sign_in.sessions using (true) with check (true)`,
        'sign_in.sessions must apply to sign_in_store only',
      ],
      [
        'create policy extra on sign_in.codes to sign_in_store using (true)',
        'sign_in.codes must have exactly one policy, and has 2',
      ],
      ['create table sign_in.planted (id int)', 'sign_in has tables'],
    ];
    for (const [planted, problem] of plants) {
      const problems = await plantedProblems(planted);
      expect({ planted, problems }).toEqual({
        planted,
        problems: expect.arrayContaining([expect.stringContaining(problem)]),
      });
    }
    // Every plant was undone.
    expect(await db.transaction(fenceProblems)).toEqual([]);
  });

  it('has no view that could read past it, and no unreviewed owner-run function', async () => {
    const { rows: views } = await db.query<{ name: string }>(
      `select c.relname as name from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
         and not coalesce('security_invoker=true' = any (c.reloptions), false)`,
    );
    expect(views).toEqual([]);
    const { rows: definers } = await db.query<{ name: string }>(
      `select proname as name from pg_proc
       where pronamespace = 'public'::regnamespace and prosecdef order by 1`,
    );
    expect(definers.map((r) => r.name)).toEqual(definerFunctions);
  });
});

describe('owner-run checks refuse to run where the owner is fenced', () => {
  let other: PGlite;
  beforeAll(async () => {
    other = await freshSchema();
    await other.exec(`
      create role fenced_owner nosuperuser nobypassrls;
      grant usage on schema public to fenced_owner;
      grant select on public.leagues, public.league_slug_history, public.programs to fenced_owner;
      grant execute on function public.require_view_of_every_league(),
        public.current_league_id() to fenced_owner;
    `);
  });
  afterAll(async () => {
    await other.close();
  });

  const fencedRefusal = {
    ...refused.privilege,
    message: expect.stringContaining('fenced by row-level security'),
  };

  /** Runs `work` while `fn` is owned by a role row-level security still fences. */
  async function ownedByFencedRole<T>(fn: string, work: () => Promise<T>): Promise<T> {
    await other.exec(`alter function public.${fn} owner to fenced_owner`);
    try {
      return await work();
    } finally {
      await other.exec(`alter function public.${fn} owner to postgres`);
    }
  }

  it('the short-name check on leagues refuses instead of passing', async () => {
    await ownedByFencedRole('check_league_slug_free()', async () => {
      await expect(newLeague(other)).rejects.toMatchObject(fencedRefusal);
    });
  });

  it('the short-name check on former names refuses instead of passing', async () => {
    const { leagueId } = await newLeague(other);
    await ownedByFencedRole('check_old_slug_free()', async () => {
      await expect(
        other.query(
          `insert into league_slug_history (league_id, old_slug, expires_at)
           values ($1, $2, now() + interval '1 year')`,
          [leagueId, unique('former')],
        ),
      ).rejects.toMatchObject(fencedRefusal);
    });
  });

  it('the default-program check refuses instead of passing', async () => {
    await ownedByFencedRole('check_league_has_default_program()', async () => {
      await expect(newLeague(other)).rejects.toMatchObject(fencedRefusal);
    });
  });

  it("the worker's take of due jobs refuses instead of taking only some (record 012)", async () => {
    await ownedByFencedRole('take_jobs(integer, integer)', async () => {
      await expect(other.query('select * from public.take_jobs(10, 60)')).rejects.toMatchObject(
        fencedRefusal,
      );
    });
  });

  it('the account for a sign-in and erasure refuse instead of reaching only some (record 052)', async () => {
    await ownedByFencedRole('account_for_sign_in(text, text)', async () => {
      await expect(
        other.query("select public.account_for_sign_in('user-1', 'fenced@example.test')"),
      ).rejects.toMatchObject(fencedRefusal);
    });
    const { leagueId, ownerId } = await newLeague(other);
    expect(leagueId).toBeTruthy();
    await ownedByFencedRole('erase_account()', async () => {
      await expect(
        other.transaction(async (tx) => {
          await tx.query("select set_config('app.account_id', $1, true)", [ownerId]);
          await tx.query('select public.erase_account()');
        }),
      ).rejects.toMatchObject(fencedRefusal);
    });
  });

  it('the short-name lookup, fenced, finds nothing rather than something wrong', async () => {
    const { leagueId } = await newLeague(other);
    const { slug } = await one<{ slug: string }>(other, 'select slug from leagues where id = $1', [
      leagueId,
    ]);
    expect(
      (await other.query('select * from public.find_league_by_slug($1)', [slug])).rows,
    ).toHaveLength(1);
    await ownedByFencedRole('find_league_by_slug(text)', async () => {
      const found = await other.query('select * from public.find_league_by_slug($1)', [slug]);
      expect(found.rows).toEqual([]);
    });
  });
});

describe("Supabase's API roles get nothing (T-64)", () => {
  it('even where they are granted everything by default', async () => {
    const hosted = new PGlite();
    try {
      // What a Supabase project does for the role that runs migrations.
      await hosted.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        grant usage on schema public to anon, authenticated, service_role;
        alter default privileges in schema public
          grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public
          grant all on functions to anon, authenticated, service_role;
        alter default privileges in schema public
          grant all on sequences to anon, authenticated, service_role;
      `);
      const run = await applyMigrations(pgliteDriver(hosted));
      expect(run.ok).toBe(true);
      const { rows } = await hosted.query<{ role: string; what: string }>(
        `select r.rolname as role, t.relname as what
         from pg_roles r cross join pg_class t
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p', 'v', 'm', 'S')
           and (has_table_privilege(r.oid, t.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
         union all
         select r.rolname, p.oid::regprocedure::text
         from pg_roles r cross join pg_proc p
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and p.pronamespace = 'public'::regnamespace and has_function_privilege(r.oid, p.oid, 'EXECUTE')
         union all
         select r.rolname, t.relname
         from pg_roles r cross join pg_class t
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and t.relnamespace = 'sign_in'::regnamespace and t.relkind in ('r', 'p')
           and (has_table_privilege(r.oid, t.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
         union all
         select r.rolname, 'schema ' || s.nspname
         from pg_roles r cross join pg_namespace s
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and s.nspname in ('public', 'sign_in')
           and has_schema_privilege(r.oid, s.oid, 'USAGE')
         union all
         select r.rolname, 'default privileges'
         from pg_roles r, pg_default_acl d, aclexplode(d.defaclacl) acl
         where r.rolname in ('anon', 'authenticated', 'service_role') and acl.grantee = r.oid`,
      );
      expect(rows).toEqual([]);
    } finally {
      await hosted.close();
    }
  });
});
