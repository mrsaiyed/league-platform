// Which of these teams are teams of the season in the scope's league and not in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listTeamsOfSeason(
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
    .where('id', 'in', [...teamIds])
    .execute();
  return rows.map((row) => row.id);
}
