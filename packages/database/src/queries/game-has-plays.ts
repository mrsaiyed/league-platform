// Whether the tracker has recorded any play of a game in the scope's league (T3 §8
// `game_events`): such a game is corrected through the tracker's commands (T-122),
// never by replacing its box score.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function gameHasPlays(scope: LeagueScope, gameId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('game_events')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
