// The scope's league's today (yyyy-mm-dd): the database's own clock in the league's own
// time zone, so it is the league's day wherever the server runs (as list-games-in-window.ts
// works it out). A roster's leaving date cannot be after it (step 2.161). Undefined for a
// league that is not there.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLeagueToday(scope: LeagueScope): Promise<string | undefined> {
  const league = await transactionOf(scope)
    .selectFrom('leagues')
    .select(sql<string>`to_char(now() at time zone time_zone, 'YYYY-MM-DD')`.as('today'))
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  return league?.today;
}
