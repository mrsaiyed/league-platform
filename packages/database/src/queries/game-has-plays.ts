// Whether the tracker has recorded any play of a game in the scope's league (T3 §8
// `game_events`): such a game is corrected through the tracker's commands (T-122),
// never by replacing its box score. The players the scorer's table added, changed or
// took off (record 058) are kept as events too, but they are not plays: a game with
// only those can still have its box score entered from a paper sheet.
import { tablePlayerEventTypes } from '@srleagues/contracts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function gameHasPlays(scope: LeagueScope, gameId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('game_events')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('type', 'not in', [...tablePlayerEventTypes])
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
