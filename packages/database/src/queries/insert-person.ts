// Adds a person to the scope's league. The table's checks (name length, email shape,
// plausible birth date) are the command's too, so they are not repeated here.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type NewPersonRow = {
  firstName: string;
  lastName: string;
  publicName: string | null;
  contactEmail: string | null;
  birthDate: string | null;
  isMinor: boolean | null;
};

/** The new person's id. */
export async function insertPerson(scope: LeagueScope, person: NewPersonRow): Promise<string> {
  const row = await transactionOf(scope)
    .insertInto('people')
    .values({
      league_id: scope.leagueId,
      first_name: person.firstName,
      last_name: person.lastName,
      public_name: person.publicName,
      contact_email: person.contactEmail,
      birth_date: person.birthDate,
      is_minor: person.isMinor,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
