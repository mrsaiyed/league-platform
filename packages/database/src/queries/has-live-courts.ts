// Whether any court of this venue, in the scope's league, is not in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function hasLiveCourts(scope: LeagueScope, venueId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('courts')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('venue_id', '=', venueId)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
