// The scope's games that still need a result (step 2.156, core's needs-result.ts): every
// live game, whenever it started, and every scheduled game whose start has passed by the
// database's clock; not in the bin and of a season not in the bin; of those, the ones in
// the person's reach (filtered before the cut); oldest first, at most `limit`. Each with
// its season's program, its day in the league's time zone and whether the account is
// assigned to it. Every table read is filtered to the scope's league (T-28).
import type { GamesWindow, ScoringReach } from '@srleagues/core';
import { sql } from 'kysely';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { gameInList, gamesForLists, inReachOf, leagueDayOf } from './games-for-lists.ts';

export async function listGamesNeedingResult(
  scope: LeagueScope,
  accountId: string,
  reach: ScoringReach,
  limit: number,
): Promise<GamesWindow> {
  const league = await leagueDayOf(scope);
  if (league === undefined) return { today: '', games: [] };
  const rows = await gamesForLists(scope, accountId, league)
    .where((eb) =>
      eb.or([
        eb('g.status', '=', 'live'),
        eb.and([eb('g.status', '=', 'scheduled'), eb('g.starts_at', '<=', sql<Date>`now()`)]),
      ]),
    )
    .where(inReachOf(scope, accountId, reach))
    // Ascending puts a live game with no time last (PostgreSQL's own order).
    .orderBy('g.starts_at')
    .orderBy('g.id')
    .limit(limit)
    .execute();
  return { today: league.today, games: rows.map(gameInList) };
}
