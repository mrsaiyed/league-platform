// Moves a team of the scope's league to the bin (`deleted_at` set; the row stays,
// A-5) or brings it back. Its roster and games stay as they are, pointing at it.
// Bringing it back can hit a short name or name another team took in the meantime,
// or another team of the season that carries on the same team from other seasons
// (0008, `teams_one_per_lineage`): 'slug-taken', 'name-taken' or 'lineage-taken', and
// the transaction is then unusable.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

/** False if it is not in the scope's league. */
export async function setTeamBinned(
  scope: LeagueScope,
  teamId: string,
  binned: boolean,
): Promise<boolean | 'slug-taken' | 'name-taken' | 'lineage-taken'> {
  try {
    const row = await transactionOf(scope)
      .updateTable('teams')
      .set({ deleted_at: binned ? new Date() : null })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', teamId)
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'teams_slug_key') return 'slug-taken';
    if (constraint === 'teams_name_key') return 'name-taken';
    if (constraint === 'teams_one_per_lineage') return 'lineage-taken';
    throw error;
  }
}
