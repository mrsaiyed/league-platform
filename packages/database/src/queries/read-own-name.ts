// The signed-in account's own name (R-21, step 2.128): the first and last name on its own
// profile (relation 'self', record 052), or undefined while it has given none. The sign-in
// gate asks it for every session (identify, database-ports.ts). Only for the account the
// transaction was opened for (0005).
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export async function readOwnName(
  scope: AppScope,
): Promise<{ readonly firstName: string; readonly lastName: string } | undefined> {
  if (scope.accountId === null) {
    throw new Error('readOwnName needs a transaction opened for an account.');
  }
  const { rows } = await sql<{ first_name: string; last_name: string }>`
    select p.first_name, p.last_name
      from public.profile_access pa
      join public.profiles p on p.id = pa.profile_id
     where pa.account_id = ${scope.accountId} and pa.relation = 'self'
  `.execute(transactionOf(scope));
  const row = rows[0];
  return row === undefined ? undefined : { firstName: row.first_name, lastName: row.last_name };
}
