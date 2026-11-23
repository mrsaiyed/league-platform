// Moves a season's standings adjustment in the scope's league to the bin (`deleted_at`
// set; the row stays, A-5). False if it is not there or is already in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function binStandingsAdjustment(
  scope: LeagueScope,
  seasonId: string,
  adjustmentId: string,
): Promise<boolean> {
  const rows = await transactionOf(scope)
    .updateTable('standings_adjustments')
    .set({ deleted_at: new Date() })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    // The other half of an overturned or awarded game goes with it (T-307).
    .where((eb) =>
      eb.or([
        eb('id', '=', adjustmentId),
        eb('paired_with', '=', adjustmentId),
        eb(
          'id',
          '=',
          eb
            .selectFrom('standings_adjustments as one')
            .select('one.paired_with')
            .where('one.league_id', '=', scope.leagueId)
            .where('one.id', '=', adjustmentId)
            .where('one.deleted_at', 'is', null),
        ),
      ]),
    )
    .returning('id')
    .execute();
  return rows.some((row) => row.id === adjustmentId);
}
