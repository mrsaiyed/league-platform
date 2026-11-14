// The signed-in account's own profile (T3 §3), made when the person first gives
// their name (record 052). Only for the account the transaction was opened for,
// through the narrow function public.create_own_profile (0012). Returns the new
// profile's id, or 'already-has-one' when the account has its own profile already.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export type OwnProfile = {
  readonly firstName: string;
  readonly lastName: string;
  /** YYYY-MM-DD, or null when not given. */
  readonly birthDate: string | null;
};

export async function createOwnProfile(
  scope: AppScope,
  profile: OwnProfile,
): Promise<{ readonly profileId: string } | 'already-has-one'> {
  if (scope.accountId === null) {
    throw new Error('createOwnProfile needs a transaction opened for an account.');
  }
  const { rows } = await sql<{ profile_id: string | null }>`
    select public.create_own_profile(${profile.firstName}, ${profile.lastName},
                                     ${profile.birthDate}::date) as profile_id
  `.execute(transactionOf(scope));
  const profileId = rows[0]?.profile_id ?? null;
  return profileId === null ? 'already-has-one' : { profileId };
}
