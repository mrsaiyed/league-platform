// The proof, if it has not run out at `at`, removed together with every other proof
// for its address, in one step: of two callers at once, with the same proof or two
// for one address, one gets it (record 018). The address is held first, before any
// proof of it is removed (as in drop-proofs-for.ts), so the two are taken one after
// the other and the second finds its proof gone.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { proofFromRow } from './proof-rows.ts';
import { purgeProofs } from './purge-proofs.ts';
import type { HeldProof } from './sign-in-store-types.ts';
import { lockSubject } from './subject-lock.ts';

export async function takeProof(
  scope: SignInScope,
  proofHash: string,
  at: Date,
): Promise<HeldProof | undefined> {
  const trx = signInTransactionOf(scope);
  const found = await trx
    .selectFrom('sign_in.proofs')
    .select('email')
    .where('proof_hash', '=', proofHash)
    .executeTakeFirst();
  if (found !== undefined) await lockSubject(scope, 'proof', 'email', found.email);
  await purgeProofs(scope, at);
  if (found === undefined) return undefined;
  const taken = await trx
    .deleteFrom('sign_in.proofs')
    .where('proof_hash', '=', proofHash)
    .where('expires_at', '>', at)
    .returningAll()
    .executeTakeFirst();
  if (taken === undefined) return undefined;
  await trx.deleteFrom('sign_in.proofs').where('email', '=', taken.email).execute();
  return proofFromRow(taken);
}
