// Moves a season's coin flip in the scope's league to the bin (`deleted_at` set; the row
// stays, A-5). False if it is not there or is already in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function binStandingsCoinFlip(
  scope: LeagueScope,
  seasonId: string,
  flipId: string,
): Promise<boolean> {
  const rows = await transactionOf(scope)
    .updateTable('standings_coin_flips')
    .set({ deleted_at: new Date() })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', '=', flipId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .execute();
  return rows.length === 1;
}
