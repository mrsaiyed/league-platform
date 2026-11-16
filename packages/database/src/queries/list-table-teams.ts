// A season's teams in the scope's league for its standings, with the division whose
// standings table each sits in, in id order: the teams not in the bin, and a team in the
// bin that has a final or forfeited result in a game not in the bin. Its results are part
// of other teams' records (A-5, A-17): left out, its opponents would lose those wins and
// losses without a word. Since A-17 no such team can be moved to the bin; one moved there
// before is still counted.
import type { TableTeam } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listTableTeams(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly TableTeam[]> {
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select(['id', 'division_id'])
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
    .orderBy('id')
    .execute();
  return rows.map((row) => ({ teamId: row.id, divisionId: row.division_id }));
}
