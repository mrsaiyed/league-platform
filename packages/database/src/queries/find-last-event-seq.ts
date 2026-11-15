// The sequence number of a game's last event in the scope's league, its plays and the
// changes of players at its table alike (T3 §8 `game_events`, record 058); 0 when it
// has none. A batch of changes of players alone saves no state, so the next batch
// numbers its events from here.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLastEventSeq(scope: LeagueScope, gameId: string): Promise<number> {
  const row = await transactionOf(scope)
    .selectFrom('game_events')
    .select((eb) => eb.fn.max('seq').as('last'))
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .executeTakeFirst();
  return Number(row?.last ?? 0);
}
