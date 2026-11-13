// Changes a roster entry of the scope's league: its number, role, leaving date or
// place. With `version`, only if it is still at it (T-46; the database adds one to the
// version itself, 0002). A number someone on the team wears, where the season asks for
// unique numbers, comes back as 'jersey-taken' (0008), and the transaction is then
// unusable: the caller rolls it back.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type RosterEntryChangeRow = {
  jerseyNumber?: string | null;
  role?: string;
  leftOn?: string;
  sort?: number;
};

/** The new version, why it was refused, or undefined if it is not there or moved on. */
export async function updateRosterEntry(
  scope: LeagueScope,
  entryId: string,
  change: RosterEntryChangeRow,
  version?: number,
): Promise<number | 'already-on-team' | 'jersey-taken' | undefined> {
  try {
    const row = await transactionOf(scope)
      .updateTable('roster_entries')
      .set({
        ...(change.jerseyNumber === undefined ? {} : { jersey_number: change.jerseyNumber }),
        ...(change.role === undefined ? {} : { role: change.role }),
        ...(change.leftOn === undefined ? {} : { left_on: change.leftOn }),
        ...(change.sort === undefined ? {} : { sort: change.sort }),
      })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', entryId)
      .$if(version !== undefined, (q) => q.where('version', '=', version ?? 0))
      .returning('version')
      .executeTakeFirst();
    return row?.version;
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'roster_entries_once') return 'already-on-team';
    if (constraint === 'roster_entries_unique_jersey') return 'jersey-taken';
    throw error;
  }
}
