// A roster entry of the scope's league by id, whether the person left or not.
// Undefined if it is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  rosterEntryColumns,
  rosterEntrySummary,
  type RosterEntrySummary,
} from './roster-entry-summary.ts';

export async function findRosterEntry(
  scope: LeagueScope,
  entryId: string,
): Promise<RosterEntrySummary | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('roster_entries')
    .select(rosterEntryColumns)
    .where('roster_entries.league_id', '=', scope.leagueId)
    .where('roster_entries.id', '=', entryId)
    .executeTakeFirst();
  return row === undefined ? undefined : rosterEntrySummary(row);
}
