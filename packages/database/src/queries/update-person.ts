// Changes a person of the scope's league who is not in the bin, only if still at
// `version` (T-46; the database adds one to the version itself, 0002).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type PersonChangeRow = {
  firstName?: string;
  lastName?: string;
  publicName?: string | null;
  contactEmail?: string | null;
  birthDate?: string | null;
  isMinor?: boolean | null;
};

/** The new version, or undefined if the person is not there, is in the bin or moved on. */
export async function updatePerson(
  scope: LeagueScope,
  personId: string,
  change: PersonChangeRow,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('people')
    .set({
      ...(change.firstName === undefined ? {} : { first_name: change.firstName }),
      ...(change.lastName === undefined ? {} : { last_name: change.lastName }),
      ...(change.publicName === undefined ? {} : { public_name: change.publicName }),
      ...(change.contactEmail === undefined ? {} : { contact_email: change.contactEmail }),
      ...(change.birthDate === undefined ? {} : { birth_date: change.birthDate }),
      ...(change.isMinor === undefined ? {} : { is_minor: change.isMinor }),
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', personId)
    .where('deleted_at', 'is', null)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
