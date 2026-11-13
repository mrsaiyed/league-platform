// The venue's courts not in the bin, in the scope's league, in order (by sort, then name).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { courtSummary, courtSummaryColumns, type CourtSummary } from './venue-summary.ts';

export async function listCourts(scope: LeagueScope, venueId: string): Promise<CourtSummary[]> {
  const rows = await transactionOf(scope)
    .selectFrom('courts')
    .select(courtSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('venue_id', '=', venueId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map(courtSummary);
}
