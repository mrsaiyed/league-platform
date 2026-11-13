// Changes a team of the scope's league that is not in the bin, only if it is still at
// `version` (T-46; the database adds one to the version itself, 0002). A short name or
// name another team of the season has comes back as 'slug-taken' or 'name-taken', and
// the transaction is then unusable: the caller rolls it back.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type TeamChangeRow = {
  divisionId?: string | null;
  slug?: string;
  name?: string;
  color?: string | null;
  statsVisibility?: string;
};

/** The new version, which field is taken, or undefined if it is not there, in the bin or moved on. */
export async function updateTeam(
  scope: LeagueScope,
  teamId: string,
  change: TeamChangeRow,
  version: number,
): Promise<number | 'slug-taken' | 'name-taken' | undefined> {
  try {
    const row = await transactionOf(scope)
      .updateTable('teams')
      .set({
        ...(change.divisionId === undefined ? {} : { division_id: change.divisionId }),
        ...(change.slug === undefined ? {} : { slug: change.slug }),
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.color === undefined ? {} : { color: change.color }),
        ...(change.statsVisibility === undefined
          ? {}
          : { stats_visibility: change.statsVisibility }),
      })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', teamId)
      .where('deleted_at', 'is', null)
      .where('version', '=', version)
      .returning('version')
      .executeTakeFirst();
    return row?.version;
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'teams_slug_key') return 'slug-taken';
    if (constraint === 'teams_name_key') return 'name-taken';
    throw error;
  }
}
