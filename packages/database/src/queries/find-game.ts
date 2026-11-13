// A game of the scope's league by id, in the bin or not (the commands decide what a
// binned one means). Undefined if it is not in the scope's league.
import type { GameRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameSummary, gameSummaryColumns } from './game-summary.ts';

export async function findGame(
  scope: LeagueScope,
  gameId: string,
): Promise<GameRecord | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select(gameSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .executeTakeFirst();
  return row === undefined ? undefined : gameSummary(row);
}
