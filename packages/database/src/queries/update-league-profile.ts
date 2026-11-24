// Sets the profile of the league the scope is for (step 2.125), only if it is still at
// `version` (T-46; the database adds one to the version itself, 0002).
import type { LeagueProfileChange } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The league's new version, or undefined if it moved on, is in the bin, or is out of sight. */
export async function updateLeagueProfile(
  scope: LeagueScope,
  profile: LeagueProfileChange,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('leagues')
    .set({
      contact_email: profile.contactEmail,
      city: profile.city,
      time_zone: profile.timeZone,
      listed: profile.listed,
    })
    .where('id', '=', scope.leagueId)
    .where('version', '=', version)
    .where('deleted_at', 'is', null)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
