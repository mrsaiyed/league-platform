// A season's standings adjustments not in the bin, with their reasons (S-10), oldest
// first. Who entered each is never read: the footnote shows the reason only.
import type { StandingsAdjustmentWithReason } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listStandingsAdjustments(
  scope: LeagueScope,
  seasonId: string,
): Promise<StandingsAdjustmentWithReason[]> {
  const rows = await transactionOf(scope)
    .selectFrom('standings_adjustments')
    .select(['id', 'team_id', 'wins', 'losses', 'ties', 'points', 'reason'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    points: row.points,
    reason: row.reason,
  }));
}
