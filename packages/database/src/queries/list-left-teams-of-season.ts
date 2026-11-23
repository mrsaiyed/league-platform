// Which of these teams of a season in the scope's league have left the league (S-87):
// marked by the admin, kept with their results, offered for no new game.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listLeftTeamsOfSeason(
  scope: LeagueScope,
  seasonId: string,
  teamIds: readonly string[],
): Promise<readonly string[]> {
  if (teamIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('teams')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .where('left_at', 'is not', null)
    .where('id', 'in', [...teamIds])
    .execute();
  return rows.map((row) => row.id);
}
