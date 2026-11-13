// Puts a person of the scope's league on a team of the scope's league, at the end of
// its roster. A person already on the team (not left) or, where the season asks for
// unique numbers, a number someone on it wears comes back as 'already-on-team' or
// 'jersey-taken' (0008), and the transaction is then unusable: the caller rolls it
// back. The command checks the team and person first; the foreign keys refuse the rest.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewRosterEntryRow = {
  teamId: string;
  personId: string;
  jerseyNumber: string | null;
  role: string;
  joinedOn: string | null;
};

export async function insertRosterEntry(
  scope: LeagueScope,
  entry: NewRosterEntryRow,
): Promise<string | 'already-on-team' | 'jersey-taken'> {
  try {
    const row = await transactionOf(scope)
      .insertInto('roster_entries')
      .values({
        league_id: scope.leagueId,
        team_id: entry.teamId,
        person_id: entry.personId,
        jersey_number: entry.jerseyNumber,
        role: entry.role,
        joined_on: entry.joinedOn,
        sort: sql<number>`(select coalesce(max(r.sort) + 1, 0) from roster_entries r where r.league_id = ${scope.leagueId} and r.team_id = ${entry.teamId})`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'roster_entries_once') return 'already-on-team';
    if (constraint === 'roster_entries_unique_jersey') return 'jersey-taken';
    throw error;
  }
}
