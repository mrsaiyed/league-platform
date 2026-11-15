// The time zone the scope's league writes its game times in (T9): what its own "today"
// is worked out in, for the public home and schedule pages (step 2.93). Undefined for a
// league that is not there or is in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLeagueTimeZone(scope: LeagueScope): Promise<string | undefined> {
  const league = await transactionOf(scope)
    .selectFrom('leagues')
    .select('time_zone')
    .where('id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return league?.time_zone;
}
