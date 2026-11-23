// How people reach the scope's league, as it was given when the league was made, or null
// when it never was (or the league cannot be read): publishing waits for one (step 2.240).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLeagueContactEmail(scope: LeagueScope): Promise<string | null> {
  const league = await transactionOf(scope)
    .selectFrom('leagues')
    .select('contact_email')
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  return league?.contact_email ?? null;
}
