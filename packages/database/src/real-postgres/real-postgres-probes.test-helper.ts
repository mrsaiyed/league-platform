// The questions the tests on the throw-away PostgreSQL (step 2.202, record 092) ask of
// it, written here because SQL lives only in packages/database. Each reads the catalog or
// counts rows; only switchFence changes anything, and only on that server.
//
// The app's side runs inside withTransaction, exactly as the app's own reads do: as
// app_user, with the league and account set for that transaction only (T-61). The
// owner's side runs on a migration connection (connectPostgresDriver), as a release does.
import { sql, type RawBuilder } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';
import type { SqlSession } from '../migrations/migration-driver.ts';

const run = async <Row>(scope: AppScope, query: RawBuilder<Row>): Promise<Row[]> =>
  (await query.execute(transactionOf(scope))).rows;

/** Who and where the transaction is: its role, its league, its account and its connection. */
export type SessionFacts = {
  readonly role: string;
  readonly leagueId: string;
  readonly accountId: string;
  readonly connection: number;
};

/** The transaction's own role, league and account settings, and its server process. */
export async function sessionFacts(scope: AppScope): Promise<SessionFacts> {
  const [row] = await run(
    scope,
    sql<{ role: string; league: string | null; account: string | null; connection: number }>`
      select current_user as role,
        current_setting('app.league_id', true) as league,
        current_setting('app.account_id', true) as account,
        pg_backend_pid() as connection`,
  );
  if (row === undefined) throw new Error('The server said nothing about the transaction.');
  return {
    role: row.role,
    leagueId: row.league ?? '',
    accountId: row.account ?? '',
    connection: Number(row.connection),
  };
}

/** The ids of every league the transaction can see. */
export async function visibleLeagueIds(scope: AppScope): Promise<string[]> {
  const rows = await run(scope, sql<{ id: string }>`select id::text as id from public.leagues`);
  return rows.map((row) => row.id).sort();
}

/** The public tables the transaction's role may read, with whether each has a league_id. */
async function readableTables(scope: AppScope) {
  return run(
    scope,
    sql<{ name: string; league_id: boolean }>`
      select c.relname as name,
        exists (select 1 from pg_catalog.pg_attribute a
                where a.attrelid = c.oid and a.attname = 'league_id' and not a.attisdropped
               ) as league_id
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and pg_catalog.has_table_privilege(c.oid, 'select')
      order by c.relname`,
  );
}

/** A table and how many of its rows a transaction could see that it should not. */
export type SeenRows = { readonly table: string; readonly rows: number };

/**
 * Every public table the transaction may read, and how many rows it sees in each that
 * are not of `leagueId` (for `leagues` itself, its id; for a table with no league_id,
 * every row). Run with no league set and `leagueId` null, every row counts. Empty when
 * the fence holds everywhere.
 */
export async function rowsBeyondLeague(
  scope: AppScope,
  leagueId: string | null,
): Promise<SeenRows[]> {
  const seen: SeenRows[] = [];
  for (const table of await readableTables(scope)) {
    const name = sql.table(`public.${table.name}`);
    const column = table.name === 'leagues' ? 'id' : table.league_id ? 'league_id' : null;
    const query =
      column === null || leagueId === null
        ? sql<{ rows: string }>`select count(*)::text as rows from ${name}`
        : sql<{ rows: string }>`select count(*)::text as rows from ${name}
            where ${sql.ref(column)} is distinct from ${leagueId}::uuid`;
    const [row] = await run(scope, query);
    const rows = Number(row?.rows ?? 0);
    if (rows > 0) seen.push({ table: table.name, rows });
  }
  return seen;
}

/** Every public table whose fence is not on and forced, in words. Empty when all are. */
export async function fenceFaults(scope: AppScope): Promise<string[]> {
  const rows = await run(
    scope,
    sql<{ name: string; enabled: boolean; forced: boolean }>`
      select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      order by c.relname`,
  );
  if (rows.length === 0) return ['no table was found in public'];
  return rows.flatMap((row) => [
    ...(row.enabled ? [] : [`${row.name}: row-level security is off`]),
    ...(row.forced ? [] : [`${row.name}: row-level security is not forced`]),
  ]);
}

const tableName = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * As the tables' owner: switches one public table's fence off or back on. The planted
 * fault of the done test; the caller switches it back on in a `finally`.
 */
export async function switchFence(
  owner: SqlSession,
  table: string,
  state: 'off' | 'on',
): Promise<void> {
  if (!tableName.test(table)) throw new TypeError(`Not a table name: ${table}`);
  await owner.exec(
    `alter table public.${table} ${state === 'off' ? 'disable' : 'enable'} row level security`,
  );
}

/**
 * Whether the session may become app_user: undefined when `set role app_user` worked
 * (then it is reset), else the database's error code. Supabase's `postgres` may not.
 */
export async function setRoleAppUser(session: SqlSession): Promise<string | undefined> {
  try {
    await session.exec('set role app_user');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    return typeof code === 'string' ? code : 'unknown';
  }
  await session.exec('reset role');
  return undefined;
}

/** A role's own powers and its memberships, as the catalog keeps them. */
export type RoleFacts = {
  readonly superuser: boolean;
  readonly createRole: boolean;
  readonly createDatabase: boolean;
  readonly bypassesFence: boolean;
  readonly replication: boolean;
  readonly memberships: readonly {
    readonly of: string;
    readonly admin: boolean;
    readonly inherit: boolean;
    readonly set: boolean;
  }[];
};

/** What `role` may do by itself, and of which roles it is a member, read by `session`. */
export async function roleFacts(session: SqlSession, role: string): Promise<RoleFacts> {
  const { rows } = await session.query<{
    superuser: boolean;
    create_role: boolean;
    create_database: boolean;
    bypasses: boolean;
    replication: boolean;
  }>(
    `select rolsuper as superuser, rolcreaterole as create_role, rolcreatedb as create_database,
            rolbypassrls as bypasses, rolreplication as replication
     from pg_catalog.pg_roles where rolname = $1`,
    [role],
  );
  const facts = rows[0];
  if (facts === undefined) throw new Error(`No role ${role}.`);
  const { rows: memberships } = await session.query<{
    of: string;
    admin: boolean;
    inherit: boolean;
    set: boolean;
  }>(
    `select g.rolname as of, m.admin_option as admin, m.inherit_option as inherit,
            m.set_option as set
     from pg_catalog.pg_auth_members m
     join pg_catalog.pg_roles g on g.oid = m.roleid
     join pg_catalog.pg_roles r on r.oid = m.member
     where r.rolname = $1
     order by g.rolname`,
    [role],
  );
  return {
    superuser: facts.superuser,
    createRole: facts.create_role,
    createDatabase: facts.create_database,
    bypassesFence: facts.bypasses,
    replication: facts.replication,
    memberships,
  };
}

/** The server's own settings a test checks: where it listens, and encryption. */
export async function serverFacts(session: SqlSession): Promise<{
  readonly listens: string;
  readonly ssl: string;
  readonly encrypted: boolean;
  readonly version: number;
}> {
  const { rows } = await session.query<{
    listens: string;
    ssl: string;
    encrypted: boolean;
    version: string;
  }>(
    `select current_setting('listen_addresses') as listens, current_setting('ssl') as ssl,
            coalesce((select s.ssl from pg_catalog.pg_stat_ssl s where s.pid = pg_backend_pid()),
                     false) as encrypted,
            current_setting('server_version_num') as version`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('The server said nothing about itself.');
  return {
    listens: row.listens,
    ssl: row.ssl,
    encrypted: row.encrypted,
    version: Number(row.version),
  };
}
