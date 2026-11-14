// The scope a query runs in: one open transaction, with the league and account it
// was opened for (T-61). Only withTransaction makes one, and it stops working when
// its transaction ends, so a scope kept past its transaction cannot run anything.
//
// T-28: every function that touches league data takes a LeagueScope. The type has a
// brand no value can carry, so a plain `{ leagueId }` object does not compile, and
// an AppScope (a transaction with no league set) does not either.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from 'kysely';
import type { Database } from './schema-types.ts';
import { normalizedUuid } from './uuid.ts';

declare const appBrand: unique symbol;
declare const leagueBrand: unique symbol;

/** A transaction opened by withTransaction, with or without a league. */
export type AppScope = {
  /** The signed-in account the transaction acts for, or null. */
  readonly accountId: string | null;
  readonly [appBrand]: true;
};

/** A transaction opened by withTransaction for one league (T-28). */
export type LeagueScope = AppScope & {
  /** The league set for this transaction; the database fences every row to it. */
  readonly leagueId: string;
  readonly [leagueBrand]: true;
};

const open = new WeakMap<AppScope, Transaction<Database>>();

/**
 * Set while withTransaction's (or withSignInTransaction's) work runs, to its scope.
 * The guarded driver (guarded-dialect.ts) refuses to hand out a second connection
 * inside it: a nested transaction or a query on the bare handle would run outside
 * this transaction's fence, and on PGlite, which has one connection, would wait
 * forever.
 */
export const workInProgress = new AsyncLocalStorage<object>();

/** Makes the scope for an open transaction. Only withTransaction calls this. */
export function openScope(
  trx: Transaction<Database>,
  leagueId: string | null,
  accountId: string | null,
): AppScope {
  for (const [name, id] of [
    ['leagueId', leagueId],
    ['accountId', accountId],
  ] as const) {
    if (id !== null && normalizedUuid(id) !== id) {
      throw new TypeError(`openScope: ${name} is not a lower-case UUID.`);
    }
  }
  // The brands are types with no value: this cast is the only way to make a scope.
  const scope = Object.freeze(
    leagueId === null ? { accountId } : { leagueId, accountId },
  ) as AppScope;
  open.set(scope, trx);
  return scope;
}

/** Ends a scope: from now on transactionOf refuses it. */
export function closeScope(scope: AppScope): void {
  open.delete(scope);
}

/** The open transaction behind a scope. Not exported from the package. */
export function transactionOf(scope: AppScope): Transaction<Database> {
  const trx = open.get(scope);
  if (trx === undefined) {
    throw new Error('This scope is not open: use it only inside its withTransaction callback.');
  }
  return trx;
}
