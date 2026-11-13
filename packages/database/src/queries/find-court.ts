// A court of the scope's league by id, in the bin or not. Undefined if it is not in the
// scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { courtSummary, courtSummaryColumns, type CourtSummary } from './venue-summary.ts';

export async function findCourt(
  scope: LeagueScope,
  courtId: string,
): Promise<CourtSummary | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('courts')
    .select(courtSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', courtId)
    .executeTakeFirst();
  return row === undefined ? undefined : courtSummary(row);
}
