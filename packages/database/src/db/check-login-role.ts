// T-60: the app must log in as a role row-level security fences. withTransaction
// drops every transaction to app_user, but the login role's own powers are what a
// query would have if it ever escaped that, so the login must have none to spare.
// The app calls this once at startup and refuses to start on any problem.
//
// The login's own powers are not the whole of it: a login may also become any role it
// is a member of (SET ROLE), directly or through other roles, and gets that role's
// powers. So every role the login may become, at any depth, is read as well, and each
// that is a superuser, bypasses row-level security, holds another power a plain login
// must not, or owns a table in any schema but the server's own, is named with the way
// there and the one statement that takes it away. Seen on a real PostgreSQL (step
// 2.202): a login that could switch to a role that bypasses row-level security passed
// the check that read the login alone.
//
// Being a member is not enough to become app_user: from PostgreSQL 16 on, the role that
// made app_user (the tables' owner, as Supabase's `postgres`) is a member of it with
// ADMIN only, and may not switch to it, so every transaction would be refused. PGlite
// runs everything as a superuser, which may.
//
// Since step 2.238 it also reads the fence itself (check-fence.ts): every league table's
// row-level security on and forced, every policy on one the migrations' own, every
// security-definer function the login may run a reviewed one, and no table the
// migrations did not make. The website, the worker and `npm run test:real-postgres` all
// run this one function.
//
// Since step 2.112 (T-490) it judges a login for one of two uses. The website's (the
// default, checkLoginRole) may reach nothing of the job queue: a membership of
// queue_owner, at any depth, or any other right on the schema pgboss is refused. The
// worker's (checkWorkerLoginRole) holds queue_owner, and pg-boss's tables in pgboss
// belong to it: a table there that the login itself or queue_owner owns is not counted,
// and every other rule is the website's, word for word.
import { sql } from 'kysely';
import { checkFence } from './check-fence.ts';
import { queueOwner, queueReachProblems, queueSchema } from './check-queue-schema.ts';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';

/** One role the login is or reaches, by the best way there (the login itself first). */
type ReachedRole = {
  /** The roles from the login to this one, both ends included. */
  path: string[];
  /** Every membership on the way lets it SET ROLE (before PostgreSQL 16, any does). */
  may_set: boolean;
  /** Every membership on the way lets it SET ROLE, or grant itself that (ADMIN). */
  may_become: boolean;
  superuser: boolean;
  bypasses_rls: boolean;
  create_role: boolean;
  create_db: boolean;
  replication: boolean;
  /** The first table it owns, by name, in a schema that is not the server's own. */
  first_table: string | null;
  tables: number;
  database_owner: string;
};

/** The powers a plain login must not have, as words and the clause that drops each. */
const powers = [
  ['superuser', 'is a superuser', 'nosuperuser'],
  ['bypasses_rls', 'bypasses row-level security', 'nobypassrls'],
  ['create_role', 'may create roles', 'nocreaterole'],
  ['create_db', 'may create databases', 'nocreatedb'],
  ['replication', 'may start replication', 'noreplication'],
] as const;

const ownedTables = (role: ReachedRole) =>
  role.tables === 1
    ? `a table (${role.first_table})`
    : `tables (${role.first_table} and ${role.tables - 1} more)`;

const listed = (parts: string[]) =>
  parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

/** What is wrong with the login itself. */
function ownProblems(login: string, self: ReachedRole): string[] {
  const problems = powers
    .filter(([power]) => self[power])
    .map(([, words, clause]) => `${login} ${words}: alter role ${login} ${clause}`);
  if (self.tables > 0) {
    const remedy =
      login === self.database_owner
        ? 'the app must log in as a role of its own (as app_login is), not as the tables’ owner'
        : `reassign owned by ${login} to ${self.database_owner}`;
    const their = self.tables === 1 ? 'its' : 'their';
    problems.push(
      `${login} owns ${ownedTables(self)}, so it could switch ${their} fence off: ${remedy}`,
    );
  }
  return problems;
}

/** What is wrong with a role the login may become, or act as through its memberships. */
function reachedProblem(login: string, role: ReachedRole): string | undefined {
  const name = role.path.at(-1) ?? '';
  const faults: string[] = role.may_become
    ? powers.filter(([power]) => role[power]).map(([, words]) => words)
    : [];
  if (role.tables > 0) faults.push(`owns ${ownedTables(role)}`);
  if (faults.length === 0) return undefined;
  const through = role.path.length > 2 ? ` through ${role.path.slice(1, -1).join(', then ')}` : '';
  const parent = role.path.at(-2) ?? login;
  return (
    `${login} may ${role.may_become ? 'become' : 'act as'} ${name}${through}, which ` +
    `${listed(faults)}: revoke ${name} from ${parent}`
  );
}

/**
 * What is wrong with the role the handle logs in as (or `role`, for tests) for the
 * website, in plain words: each names the role, what it can do that it must not, and the
 * statement that takes that away. Empty means it is fit for the app. `membershipOptions`
 * says whether the server keeps SET, INHERIT and ADMIN per membership (PostgreSQL 16 on);
 * read from the server unless a test says. A login that reaches the job queue is refused
 * (T-490).
 */
export async function checkLoginRole(
  db: DatabaseHandle,
  role?: string,
  membershipOptions?: boolean,
): Promise<string[]> {
  return judgeLogin(db, 'website', role, membershipOptions);
}

/**
 * The same for the worker's login (T-490): as checkLoginRole, but it may hold queue_owner,
 * and a table in the job queue's schema that it or queue_owner owns (pg-boss's) is let be.
 */
export async function checkWorkerLoginRole(
  db: DatabaseHandle,
  role?: string,
  membershipOptions?: boolean,
): Promise<string[]> {
  return judgeLogin(db, 'worker', role, membershipOptions);
}

async function judgeLogin(
  db: DatabaseHandle,
  use: 'website' | 'worker',
  role: string | undefined,
  membershipOptions: boolean | undefined,
): Promise<string[]> {
  const database = kyselyOf(db);
  const withOptions =
    membershipOptions ??
    ((
      await sql<{ version: number }>`
        select pg_catalog.current_setting('server_version_num')::int as version`.execute(database)
    ).rows[0]?.version ?? 0) >= 160000;
  // Before PostgreSQL 16 every membership lets a member SET ROLE.
  const setEdge = sql.raw(withOptions ? 'm.set_option' : 'true');
  const becomeEdge = sql.raw(withOptions ? '(m.set_option or m.admin_option)' : 'true');
  const { rows } = await sql<ReachedRole>`
    with recursive reach(oid, path, may_set, may_become, seen) as (
      select r.oid, array[r.rolname::text], true, true, array[r.oid]
      from pg_catalog.pg_roles r
      where r.rolname = coalesce(${role ?? null}::text, session_user)
      union all
      select m.roleid, p.path || g.rolname::text, p.may_set and ${setEdge},
        p.may_become and ${becomeEdge}, p.seen || m.roleid
      from reach p
      join pg_catalog.pg_auth_members m on m.member = p.oid
      join pg_catalog.pg_roles g on g.oid = m.roleid
      where m.roleid <> all(p.seen)
    ), best as (
      select distinct on (oid) oid, path, may_set, may_become from reach
      order by oid, may_set desc, may_become desc, cardinality(path)
    )
    select b.path, b.may_set, b.may_become, g.rolsuper as superuser,
      g.rolbypassrls as bypasses_rls, g.rolcreaterole as create_role,
      g.rolcreatedb as create_db, g.rolreplication as replication,
      owned.first_table, owned.tables,
      (select pg_catalog.pg_get_userbyid(d.datdba)::text from pg_catalog.pg_database d
       where d.datname = pg_catalog.current_database()) as database_owner
    from best b
    join pg_catalog.pg_roles g on g.oid = b.oid
    cross join lateral (
      select min(n.nspname || '.' || c.relname) as first_table, count(*)::int as tables
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relowner = b.oid and c.relkind in ('r', 'p')
        and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        -- The worker's own pg-boss tables (T-490): owned by its login or by queue_owner.
        and not (${use === 'worker'}::boolean and n.nspname = ${queueSchema}
          and (cardinality(b.path) = 1 or g.rolname = ${queueOwner}))
    ) owned
    order by cardinality(b.path), g.rolname`.execute(database);
  const self = rows[0];
  if (self === undefined) return ['the login role does not exist'];
  const login = self.path[0] ?? '';
  const problems = ownProblems(login, self);
  for (const reached of rows.slice(1)) {
    const problem = reachedProblem(login, reached);
    if (problem !== undefined) problems.push(problem);
  }
  // A superuser may become any role; its being one is reported above.
  if (login !== 'app_user' && !self.superuser) {
    const appUser = rows.find((reached) => reached.path.at(-1) === 'app_user');
    if (appUser === undefined) {
      problems.push(`${login} is not app_user and cannot become it: grant app_user to ${login}`);
    } else if (!appUser.may_set) {
      problems.push(
        `${login} is a member of app_user but may not switch to it (set role): ` +
          `grant app_user to ${login} with set true`,
      );
    }
  }
  // Step 2.112 (T-490): the website reaches nothing of the job queue.
  if (use === 'website') {
    problems.push(
      ...(await queueReachProblems(db, {
        login,
        superuser: self.superuser,
        paths: rows.map((reached) => reached.path),
      })),
    );
  }
  // Step 2.238: and the fence the login cannot step past must be whole (check-fence.ts).
  const name = (reached: ReachedRole) => reached.path.at(-1) ?? '';
  problems.push(
    ...(await checkFence(db, {
      login,
      mayBecome: rows
        .slice(1)
        .filter((reached) => reached.may_become)
        .map(name),
      reached: rows.map(name),
      databaseOwner: self.database_owner,
      ...(use === 'worker' ? { queueSchema } : {}),
    })),
  );
  return problems;
}
