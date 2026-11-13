// A season's standings adjustments (S-10) in the scope's league, not in the bin, in id
// order: what the calculation applies on top of the games.
import type { SeasonAdjustment } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listStandingsAdjustments(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly SeasonAdjustment[]> {
  const rows = await transactionOf(scope)
    .selectFrom('standings_adjustments')
    .select(['id', 'team_id', 'wins', 'losses', 'ties', 'points', 'reason'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
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
