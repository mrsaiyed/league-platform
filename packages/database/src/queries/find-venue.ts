// A venue of the scope's league by id, in the bin or not (the commands decide what a
// binned one means). Undefined if it is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { venueSummary, venueSummaryColumns, type VenueSummary } from './venue-summary.ts';

export async function findVenue(
  scope: LeagueScope,
  venueId: string,
): Promise<VenueSummary | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('venues')
    .select(venueSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', venueId)
    .executeTakeFirst();
  return row === undefined ? undefined : venueSummary(row);
}
