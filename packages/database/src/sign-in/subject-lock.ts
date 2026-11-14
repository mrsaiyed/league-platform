// Holds one address's or network's counts (or proofs) for the rest of the
// transaction, so two requests at once about the same one are counted one after the
// other and neither slips past a limit (record 013). Every method takes its locks in
// the same order (the network before the address), so two cannot wait on each other.
import { sql } from 'kysely';
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export type LockKind = 'code' | 'guess' | 'proof';

export async function lockSubject(
  scope: SignInScope,
  kind: LockKind,
  subjectScope: 'email' | 'network',
  subject: string,
): Promise<void> {
  const key = `sign_in.${kind}:${subjectScope}:${subject}`;
  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    signInTransactionOf(scope),
  );
}
