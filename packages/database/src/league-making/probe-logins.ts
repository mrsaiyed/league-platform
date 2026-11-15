// What each login of the tool that makes a league (record 057) may do, asked before the
// plan is shown and again before anything is made, so a login that cannot do its part
// is refused in plain words before an account is made, never with a code after "yes".
//
// - The app's own login (hosted only) must pass checkLoginRole (T-60: not a superuser,
//   not bypassing row-level security, not the tables' owner, a member of app_user),
//   and a real transaction must switch it to app_user, as every command does.
// - The migration login must see past the account rows' own fence (accounts force
//   row-level security, 0005: only a superuser or a role that bypasses it finds an
//   account by email), may read, add and remove accounts, may read the migration log,
//   and may call find_league_by_slug and uuid_v7. Anything not there yet (a database
//   with no migrations) is left to the migration check that follows.
// On PGlite one superuser does both, and only the migration login's part is asked.
import { sql } from 'kysely';
import { checkLoginRole } from '../db/check-login-role.ts';
import { transactionOf } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import type { SqlSession } from '../migrations/index.ts';
import type { LeagueMakingTarget } from './league-making-target.ts';

/** What the migration login lacks. */
export type MigrationLoginGap =
  /** It cannot see past the accounts' fence: neither a superuser nor bypassing it. */
  'sees-past-fence' | 'accounts' | 'migration-log' | 'functions';

export type LoginProblem =
  /** The app's login breaks T-60 (checkLoginRole's words), or cannot become app_user. */
  | { readonly login: 'app'; readonly problems: readonly string[] }
  | { readonly login: 'migration'; readonly gaps: readonly MigrationLoginGap[] };

type MigrationFacts = {
  sees_past_fence: boolean | null;
  accounts: boolean | null;
  migration_log: boolean | null;
  functions: boolean | null;
};

/** What the migration login lacks, if anything. Reads the catalog only. */
export async function migrationLoginGaps(session: SqlSession): Promise<MigrationLoginGap[]> {
  const { rows } = await session.query<MigrationFacts>(
    `select
       (select r.rolsuper or r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user)
         as sees_past_fence,
       case when to_regclass('public.accounts') is null then true
         -- Each on its own: a list of privileges answers true when ANY one is held.
         else has_table_privilege('public.accounts', 'select')
           and has_table_privilege('public.accounts', 'insert')
           and has_table_privilege('public.accounts', 'delete') end as accounts,
       -- In this order: looking a table up in a schema one may not use is itself refused.
       case when not exists (select 1 from pg_catalog.pg_namespace where nspname = 'migration_log')
              then true
            when not has_schema_privilege('migration_log', 'usage') then false
            when to_regclass('migration_log.applied') is null then true
            else has_table_privilege('migration_log.applied', 'select') end as migration_log,
       case when to_regprocedure('public.find_league_by_slug(text)') is null
              or to_regprocedure('public.uuid_v7()') is null then true
         else has_function_privilege('public.find_league_by_slug(text)', 'execute')
           and has_function_privilege('public.uuid_v7()', 'execute') end as functions`,
  );
  const facts = rows[0];
  const gaps: MigrationLoginGap[] = [];
  if (facts?.sees_past_fence !== true) gaps.push('sees-past-fence');
  if (facts?.accounts !== true) gaps.push('accounts');
  if (facts?.migration_log !== true) gaps.push('migration-log');
  if (facts?.functions !== true) gaps.push('functions');
  return gaps;
}

/** What the app's login breaks, if anything: checkLoginRole, then a real switch to app_user. */
export async function appLoginProblems(target: LeagueMakingTarget): Promise<string[]> {
  const problems = await checkLoginRole(target.db);
  if (problems.length > 0) return problems;
  try {
    const role = await withTransaction(target.db, {}, async (scope) => {
      const { rows } = await sql<{ role: string }>`select current_user as role`.execute(
        transactionOf(scope),
      );
      return rows[0]?.role;
    });
    return role === 'app_user' ? [] : ['it could not become app_user'];
  } catch {
    return ['it could not become app_user'];
  }
}

/** Every login problem of the target, the app's first. Empty when both may do their part. */
export async function probeLogins(target: LeagueMakingTarget): Promise<LoginProblem[]> {
  const found: LoginProblem[] = [];
  if (target.appLogin === 'own') {
    const problems = await appLoginProblems(target);
    if (problems.length > 0) found.push({ login: 'app', problems });
  }
  const gaps = await migrationLoginGaps(target.login);
  if (gaps.length > 0) found.push({ login: 'migration', gaps });
  return found;
}
