// Adds a team to a season of the scope's league. It gets a lineage of its own (the
// column's default, 0008). The short name and the name are each unique in the season
// while not in the bin (0008): a repeat comes back as 'slug-taken' or 'name-taken', and
// the transaction is then unusable: the caller rolls it back. The season and division
// are checked by the command first; the database's foreign keys refuse the rest.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewTeamRow = {
  seasonId: string;
  divisionId: string | null;
  slug: string;
  name: string;
  color: string | null;
  statsVisibility: string;
};

/** The new team's id, or which field is taken. */
export async function insertTeam(
  scope: LeagueScope,
  team: NewTeamRow,
): Promise<string | 'slug-taken' | 'name-taken'> {
  try {
    const row = await transactionOf(scope)
      .insertInto('teams')
      .values({
        league_id: scope.leagueId,
        season_id: team.seasonId,
        division_id: team.divisionId,
        slug: team.slug,
        name: team.name,
        color: team.color,
        stats_visibility: team.statsVisibility,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'teams_slug_key') return 'slug-taken';
    if (constraint === 'teams_name_key') return 'name-taken';
    throw error;
  }
}
