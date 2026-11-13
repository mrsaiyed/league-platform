// The number of the latest published schedule revision of a season of the scope's league,
// or null if the season has none yet (T3 §8).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function latestScheduleRevision(
  scope: LeagueScope,
  seasonId: string,
): Promise<number | null> {
  const row = await transactionOf(scope)
    .selectFrom('schedule_revisions')
    .select('number')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .orderBy('number', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.number ?? null;
}
