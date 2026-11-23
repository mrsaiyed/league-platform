// A season's teams, by name, of a season that is active or completed, for the public
// standings and statistics reads. Built field by field (T-29). The teams not in the bin,
// and a team in the bin with a final or forfeited result in a game not in the bin, marked
// `removed` (A-17): the standings keep its row, so every team that played is listed and
// its opponents' records add up, but it has no page and is never linked.
import type { SeasonTeamRow } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listSeasonTeams(
  scope: LeagueScope,
  seasonId: string,
): Promise<SeasonTeamRow[]> {
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select([
      'id',
      'name',
      'slug',
      'color',
      'division_id',
      'stats_visibility',
      'deleted_at',
      'left_at',
    ])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where((eb) =>
      eb.or([
        eb('deleted_at', 'is', null),
        eb.exists(
          eb
            .selectFrom('games')
            .select('games.id')
            .where('games.league_id', '=', scope.leagueId)
            .whereRef('games.season_id', '=', 'teams.season_id')
            .where('games.deleted_at', 'is', null)
            .where('games.status', 'in', ['final', 'forfeit'])
            .where((inner) =>
              inner.or([
                inner('games.home_team_id', '=', inner.ref('teams.id')),
                inner('games.away_team_id', '=', inner.ref('teams.id')),
              ]),
            ),
        ),
      ]),
    )
    .where('season_id', 'in', (eb) =>
      eb
        .selectFrom('seasons')
        .select('seasons.id')
        .where('seasons.league_id', '=', scope.leagueId)
        .where('seasons.deleted_at', 'is', null)
        .where('seasons.status', 'in', ['active', 'completed']),
    )
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    divisionId: row.division_id,
    statsVisibility: row.stats_visibility,
    removed: row.deleted_at !== null,
    left: row.left_at !== null,
  }));
}
