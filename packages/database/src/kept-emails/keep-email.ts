// Keeps one email on the test copy (step 2.204, record 075 option 5): through the one
// owner-run function public.keep_email (0023), in a transaction of its own as the app's
// role, with no league and no account. The function refuses an address that is not made
// up and keeps only the newest 300, none older than 3 days; the app's role cannot read
// what it wrote.
//
// A platform table, not a league's (like the sign-in store): no league id. It throws what
// the database threw; the caller reports it by its kind only (keepFailureOf), never with
// the address, the subject or the words.
import { sql } from 'kysely';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { transactionOf } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';

/**
 * What is kept of an email: who it was to, what it carries (a code to type or a link to
 * follow, which the reading script prints), its subject and its plain words.
 */
export type EmailToKeep = {
  readonly to: string;
  readonly kind: 'code' | 'link';
  readonly subject: string;
  readonly text: string;
};

export async function keepEmail(db: DatabaseHandle, email: EmailToKeep): Promise<void> {
  await withTransaction(db, {}, async (scope) => {
    await sql`select public.keep_email(${email.to}, ${email.kind}, ${email.subject}, ${email.text})`.execute(
      transactionOf(scope),
    );
  });
}

/**
 * Why a keep failed, by its kind only: `refused` when the database refused what it was
 * given (SQLSTATE class 22 or 23: an address that is not made up, a value too long),
 * `fault` for anything else (not reached, a lost connection, a missing grant).
 */
export function keepFailureOf(error: unknown): 'refused' | 'fault' {
  if (typeof error !== 'object' || error === null) return 'fault';
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && /^2[23][0-9A-Z]{3}$/.test(code) ? 'refused' : 'fault';
}
