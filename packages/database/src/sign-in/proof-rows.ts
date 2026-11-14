// How a proof and a code's kind are read back. Runs no SQL of its own.
import type { Selectable } from 'kysely';
import type { SignInProofsTable } from '../db/schema-types.ts';
import type { HeldProof, VerifyType } from './sign-in-store-types.ts';

const verifyTypes: readonly VerifyType[] = ['signup', 'magiclink', 'recovery'];

/** The kind of check a code answers, as stored (0012 allows only these). */
export function verifyTypeOf(value: string | null): VerifyType | null {
  if (value === null) return null;
  const found = verifyTypes.find((type) => type === value);
  if (found === undefined) throw new Error(`Unknown kind of code in the sign-in store: ${value}`);
  return found;
}

export function proofFromRow(row: Selectable<SignInProofsTable>): HeldProof {
  return {
    email: row.email,
    accountId: row.user_id,
    expiresAt: row.expires_at,
    supabase: {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      accessExpiresAt: row.access_expires_at,
      sessionId: row.vendor_session_id,
    },
  };
}
