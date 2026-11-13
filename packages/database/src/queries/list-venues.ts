// The scope's league's venues not in the bin, by name, each with its courts not in the
// bin in order (by sort, then name).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  courtSummary,
  courtSummaryColumns,
  venueSummary,
  venueSummaryColumns,
  type CourtSummary,
  type VenueSummary,
} from './venue-summary.ts';

export async function listVenues(
  scope: LeagueScope,
): Promise<(VenueSummary & { courts: CourtSummary[] })[]> {
  const trx = transactionOf(scope);
  const venues = await trx
    .selectFrom('venues')
    .select(venueSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .orderBy('name')
    .orderBy('id')
    .execute();
  const courts = await trx
    .selectFrom('courts')
    .select(courtSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute();
  return venues.map((venue) => ({
    ...venueSummary(venue),
    courts: courts.filter((court) => court.venue_id === venue.id).map(courtSummary),
  }));
}
