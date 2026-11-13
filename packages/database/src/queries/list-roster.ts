// Everyone who is or was on a team of the scope's league, in roster order: those still
// on it first, then those who left (R-17, T-52), each by place, then id. Only the
// person's names are read, never their birth date or contact details (R-16).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  rosterEntryColumns,
  rosterEntrySummary,
  type RosterEntrySummary,
} from './roster-entry-summary.ts';

export type RosterLineSummary = RosterEntrySummary & {
  firstName: string;
  lastName: string;
  publicName: string | null;
};

export async function listRoster(scope: LeagueScope, teamId: string): Promise<RosterLineSummary[]> {
  const rows = await transactionOf(scope)
    .selectFrom('roster_entries')
    .innerJoin('people', (join) =>
      join
        .onRef('people.league_id', '=', 'roster_entries.league_id')
        .onRef('people.id', '=', 'roster_entries.person_id'),
    )
    .select(rosterEntryColumns)
    .select(['people.first_name', 'people.last_name', 'people.public_name'])
    .where('roster_entries.league_id', '=', scope.leagueId)
    .where('roster_entries.team_id', '=', teamId)
    .orderBy('roster_entries.left_on', (o) => o.asc().nullsFirst())
    .orderBy('roster_entries.sort')
    .orderBy('roster_entries.id')
    .execute();
  return rows.map((row) => ({
    ...rosterEntrySummary(row),
    firstName: row.first_name,
    lastName: row.last_name,
    publicName: row.public_name,
  }));
}
