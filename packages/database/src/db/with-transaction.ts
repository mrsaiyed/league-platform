// Every read and write of the app runs inside this (T-61). It opens one transaction,
// switches it to the app's restricted role, sets the league and account for that
// transaction only, runs `work`, and commits, or rolls back if `work` throws.
//
// `set_config(..., true)` and `set local role` last until the transaction ends and
// no longer. A pooled connection is handed to the next request afterwards, so a
// session-wide setting would carry one league into another league's request; the
// test beside this file proves the next transaction on the same connection starts
// with no league and its login role.
//
// How the restricted role is reached: the app logs in as app_user, or as a role that
// is a member of it; on PGlite, tests run as the superuser. Either way `set local
// role app_user` makes the transaction subject to row-level security, which a
// superuser or the tables' owner would otherwise not be.
//
// Every query must be awaited inside `work`. One still running when `work` ends is
// waited for before the commit or rollback; one started after is refused
// (guarded-dialect.ts). Calling withTransaction again inside `work`, or querying
// the bare handle there, is refused too: it would run outside this transaction's
// fence, and on PGlite, which has one connection, wait forever. Pass the scope.
import { sql } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import {
  closeScope,
  openScope,
  workInProgress,
  type AppScope,
  type LeagueScope,
} from './transaction-scope.ts';
import { normalizedUuid } from './uuid.ts';

/** A transaction for one league, optionally for a signed-in account. */
export type LeagueContext = { leagueId: string; accountId?: string | undefined };
/** A transaction with no league: it sees only the account's own rows, if any. */
export type AccountContext = { leagueId?: undefined; accountId?: string | undefined };

/** The id in lower case, as the database reads it (0005), or an error. */
function checkedId(name: string, value: unknown): string | null {
  if (value === undefined) return null;
  const id = normalizedUuid(value);
  if (id === null) throw new TypeError(`withTransaction: ${name} is not a UUID.`);
  return id;
}

export function withTransaction<T>(
  db: DatabaseHandle,
  context: LeagueContext,
  work: (scope: LeagueScope) => Promise<T>,
): Promise<T>;
export function withTransaction<T>(
  db: DatabaseHandle,
  context: AccountContext,
  work: (scope: AppScope) => Promise<T>,
): Promise<T>;
export async function withTransaction<T>(
  db: DatabaseHandle,
  context: LeagueContext | AccountContext,
  work: (scope: LeagueScope) => Promise<T>,
): Promise<T> {
  if (workInProgress.getStore() !== undefined) {
    throw new Error(
      'withTransaction was called inside another withTransaction: pass the scope you were given instead.',
    );
  }
  // Checked before anything reaches the database: a value that is not a UUID would
  // read as no league (0005), and a typo should fail loudly instead.
  const leagueId = checkedId('leagueId', context.leagueId);
  const accountId = checkedId('accountId', context.accountId);
  return kyselyOf(db)
    .transaction()
    .execute(async (trx) => {
      await sql`set local role app_user`.execute(trx);
      // Both are always set, to '' when absent, which the database reads as none.
      await sql`select set_config('app.league_id', ${leagueId ?? ''}, true),
                       set_config('app.account_id', ${accountId ?? ''}, true)`.execute(trx);
      const scope = openScope(trx, leagueId, accountId);
      try {
        // The overloads guarantee `work` accepts the scope made from `context`.
        return await workInProgress.run(scope, () => work(scope as LeagueScope));
      } finally {
        closeScope(scope);
      }
    });
}
