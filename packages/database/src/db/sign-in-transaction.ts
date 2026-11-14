// The sign-in store's transactions (record 052). The store's tables are in the
// schema `sign_in`, which app_user cannot use; only the role sign_in_store reaches
// them, and it reaches nothing else (0012). So the store's queries never run inside
// withTransaction: each runs in one of these, which switches to sign_in_store for
// that transaction only, as withTransaction does to app_user.
//
// The app's login must be a member of sign_in_store as well as of app_user; on
// PGlite, tests run as the superuser. Each store method is one of these
// transactions, which is what makes it one atomic step (record 018).
//
// The same guards as withTransaction: no nesting, no second connection inside the
// work (guarded-dialect.ts), and a scope that stops working when its transaction
// ends.
import { sql, type Transaction } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import type { SignInDatabase } from './schema-types.ts';
import { workInProgress } from './transaction-scope.ts';

declare const signInBrand: unique symbol;

/** A transaction opened by withSignInTransaction, as sign_in_store. */
export type SignInScope = { readonly [signInBrand]: true };

const open = new WeakMap<SignInScope, Transaction<SignInDatabase>>();

export async function withSignInTransaction<T>(
  db: DatabaseHandle,
  work: (scope: SignInScope) => Promise<T>,
): Promise<T> {
  if (workInProgress.getStore() !== undefined) {
    throw new Error(
      'withSignInTransaction was called inside another transaction: pass the scope you were given instead.',
    );
  }
  return kyselyOf(db)
    .transaction()
    .execute(async (trx) => {
      await sql`set local role sign_in_store`.execute(trx);
      // No league and no account: the store reaches no table that reads them.
      await sql`select set_config('app.league_id', '', true),
                       set_config('app.account_id', '', true)`.execute(trx);
      // The brand is a type with no value: this cast is the only way to make a scope.
      const scope = Object.freeze({}) as SignInScope;
      // The same connection, typed for the sign_in schema only: the role cannot reach
      // public's tables, so the type does not offer them.
      open.set(scope, trx as unknown as Transaction<SignInDatabase>);
      try {
        return await workInProgress.run(scope, () => work(scope));
      } finally {
        open.delete(scope);
      }
    });
}

/** The open transaction behind a sign-in scope. Not exported from the package. */
export function signInTransactionOf(scope: SignInScope): Transaction<SignInDatabase> {
  const trx = open.get(scope);
  if (trx === undefined) {
    throw new Error(
      'This sign-in scope is not open: use it only inside its withSignInTransaction callback.',
    );
  }
  return trx;
}
