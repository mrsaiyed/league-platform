// A season's decided games (final or forfeit) in the scope's league, not in the bin,
// in id order: what standings and season totals are worked out from (S-9, S-11).
import type { GameRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameSummary, gameSummaryColumns } from './game-summary.ts';

export async function listDecidedGames(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly GameRecord[]> {
  const rows = await transactionOf(scope)
    .selectFrom('games')
    .select(gameSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('status', 'in', ['final', 'forfeit'])
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map(gameSummary);
}
