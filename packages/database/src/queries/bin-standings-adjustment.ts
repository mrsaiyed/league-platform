// Moves a season's standings adjustment in the scope's league to the bin (`deleted_at`
// set; the row stays, A-5). False if it is not there or is already in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function binStandingsAdjustment(
  scope: LeagueScope,
  seasonId: string,
  adjustmentId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('standings_adjustments')
    .set({ deleted_at: new Date() })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', '=', adjustmentId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
