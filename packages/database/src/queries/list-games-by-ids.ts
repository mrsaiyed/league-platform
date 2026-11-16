// The scope's games of these ids (step 2.153: the games a public page shows, asked which the
// signed-in person may score): not in the bin and of a season not in the bin, each with its
// season's program, its day in the league's time zone and whether the account is assigned
// to it, as the lists read them. An id of no such game in this league is left out. Every
// table read is filtered to the scope's league (T-28).
import type { GamesWindow } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { gameInList, gamesForLists, leagueDayOf } from './games-for-lists.ts';

export async function listGamesByIds(
  scope: LeagueScope,
  accountId: string,
  gameIds: readonly string[],
): Promise<GamesWindow> {
  if (gameIds.length === 0) return { today: '', games: [] };
  const league = await leagueDayOf(scope);
  if (league === undefined) return { today: '', games: [] };
  const rows = await gamesForLists(scope, accountId, league)
    .where('g.id', 'in', [...gameIds])
    .orderBy('g.id')
    .execute();
  return { today: league.today, games: rows.map(gameInList) };
}
