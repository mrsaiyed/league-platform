// The proof, if it has not run out at `at`, without using it.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { proofFromRow } from './proof-rows.ts';
import { purgeProofs } from './purge-proofs.ts';
import type { HeldProof } from './sign-in-store-types.ts';

export async function peekProof(
  scope: SignInScope,
  proofHash: string,
  at: Date,
): Promise<HeldProof | undefined> {
  await purgeProofs(scope, at);
  const row = await signInTransactionOf(scope)
    .selectFrom('sign_in.proofs')
    .selectAll()
    .where('proof_hash', '=', proofHash)
    .executeTakeFirst();
  return row === undefined ? undefined : proofFromRow(row);
}
