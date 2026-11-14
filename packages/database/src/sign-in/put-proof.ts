// A proof from a right code, good for one new password until it runs out.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { HeldProof } from './sign-in-store-types.ts';

export async function putProof(
  scope: SignInScope,
  proofHash: string,
  proof: HeldProof,
): Promise<void> {
  const row = {
    email: proof.email,
    user_id: proof.accountId,
    expires_at: proof.expiresAt,
    access_token: proof.supabase.accessToken,
    refresh_token: proof.supabase.refreshToken,
    access_expires_at: proof.supabase.accessExpiresAt,
    vendor_session_id: proof.supabase.sessionId,
  };
  await signInTransactionOf(scope)
    .insertInto('sign_in.proofs')
    .values({ proof_hash: proofHash, ...row })
    .onConflict((conflict) => conflict.column('proof_hash').doUpdateSet(row))
    .execute();
}
