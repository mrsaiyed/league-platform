// What a team of the scope's league has of games, for whether it may go to the bin (A-17):
// how many of its games not in the bin have a final or forfeited result, and the ids of
// those still to play (scheduled, postponed or live). A cancelled game is in neither. A
// team of another league has none.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findTeamGames(
  scope: LeagueScope,
  teamId: string,
): Promise<{ readonly played: number; readonly toPlayIds: readonly string[] }> {
  const rows = await transactionOf(scope)
    .selectFrom('games')
    .select(['id', sql<boolean>`status in ('final', 'forfeit')`.as('decided')])
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .where((eb) => eb.or([eb('home_team_id', '=', teamId), eb('away_team_id', '=', teamId)]))
    .where('status', 'in', ['final', 'forfeit', 'scheduled', 'postponed', 'live'])
    .orderBy('id')
    .execute();
  return {
    played: rows.filter((row) => row.decided).length,
    toPlayIds: rows.filter((row) => !row.decided).map((row) => row.id),
  };
}
