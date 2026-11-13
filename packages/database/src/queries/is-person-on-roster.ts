// Whether the person is on a roster of the scope's league now: an entry with no
// leaving date (R-17: a player who left stays in the history with a date).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function isPersonOnRoster(scope: LeagueScope, personId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('roster_entries')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('person_id', '=', personId)
    .where('left_on', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
