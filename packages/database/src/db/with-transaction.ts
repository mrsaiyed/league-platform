// Every read and write of the app runs inside this (T-61). It opens one transaction,
// switches it to the app's restricted role, sets the league and account for that
// transaction only, runs `work`, and commits, or rolls back if `work` throws.
//
// `set_config(..., true)` and `set local role` last until the transaction ends and
// no longer. A pooled connection is handed to the next request afterwards, so a
// session-wide setting would carry one league into another league's request; the
// test beside this file proves the next transaction on the same connection starts
// with no league and its login role. The one session-wide setting is the id function's
// memory of its last id (srleagues.uuid_v7_last, migration 0019, record 068): it holds
// no league, person or permission, and nothing but that function reads it.
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
//
// One snapshot (record 070, T-274): a transaction opened as it is by default is READ
// COMMITTED on PostgreSQL, so each statement sees rows saved after the one before it, and
// "one transaction" is not "one moment". The reads of a public page ask for
// `{ snapshot: 'page' }`: REPEATABLE READ and READ ONLY, so every statement in it sees the
// database as it was at its first, and nothing in it can write. The league and account
// are set exactly as for any other transaction. Commands keep the default.
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

/**
 * How the transaction reads. `snapshot: 'page'` (a public page's reads, record 070): one
 * moment for every statement (REPEATABLE READ), and no write (READ ONLY). Left out: the
 * database's default, as for a command.
 */
export type TransactionOptions = { readonly snapshot?: 'page' | undefined };

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
  options?: TransactionOptions,
): Promise<T>;
export function withTransaction<T>(
  db: DatabaseHandle,
  context: AccountContext,
  work: (scope: AppScope) => Promise<T>,
  options?: TransactionOptions,
): Promise<T>;
export async function withTransaction<T>(
  db: DatabaseHandle,
  context: LeagueContext | AccountContext,
  work: (scope: LeagueScope) => Promise<T>,
  options: TransactionOptions = {},
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
  const opened = kyselyOf(db).transaction();
  const transaction =
    options.snapshot === 'page'
      ? opened.setIsolationLevel('repeatable read').setAccessMode('read only')
      : opened;
  return transaction.execute(async (trx) => {
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
