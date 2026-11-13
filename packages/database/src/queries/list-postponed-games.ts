// The scope's games waiting to be rescheduled, not in the bin, soonest first (those
// with no date last), of one season or all.
import type { GameRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameSummary, gameSummaryColumns } from './game-summary.ts';

export async function listPostponedGames(
  scope: LeagueScope,
  seasonId?: string,
): Promise<readonly GameRecord[]> {
  let query = transactionOf(scope)
    .selectFrom('games')
    .select(gameSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('status', '=', 'postponed')
    .where('deleted_at', 'is', null);
  if (seasonId !== undefined) query = query.where('season_id', '=', seasonId);
  const rows = await query
    .orderBy('starts_at', (o) => o.asc().nullsLast())
    .orderBy('id')
    .execute();
  return rows.map(gameSummary);
}
