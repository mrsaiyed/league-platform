// Forgets every proof that has run out at `at`, with the Supabase tokens it held
// (record 018). Called before any proof is looked up, as the in-memory store does.
// The Supabase sessions those tokens belong to are not ended here (record 052).
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function purgeProofs(scope: SignInScope, at: Date): Promise<void> {
  await signInTransactionOf(scope)
    .deleteFrom('sign_in.proofs')
    .where('expires_at', '<=', at)
    .execute();
}
