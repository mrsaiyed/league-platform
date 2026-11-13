// Adds a standings adjustment (S-10) to a season of the scope's league and returns its
// id. The database refuses a team that is not in that season, an adjustment that
// changes nothing, and values out of range (migration 0010).
import type { NewAdjustment } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertStandingsAdjustment(
  scope: LeagueScope,
  seasonId: string,
  adjustment: NewAdjustment,
): Promise<string> {
  const row = await transactionOf(scope)
    .insertInto('standings_adjustments')
    .values({
      league_id: scope.leagueId,
      season_id: seasonId,
      team_id: adjustment.teamId,
      wins: adjustment.wins,
      losses: adjustment.losses,
      ties: adjustment.ties,
      points: adjustment.points,
      reason: adjustment.reason,
      account_id: adjustment.accountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
