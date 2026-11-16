// The scope's league's own name, as its pages show it first in the header (U-8, T-188):
// the name its owner gave it, in any script. Its name only: nothing else of the league
// row (no owner, no contact address). Undefined for a league that is not there or is in
// the bin. Who may see the league's pages is the league gate's rule (U-9), asked before.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLeagueName(scope: LeagueScope): Promise<string | undefined> {
  const league = await transactionOf(scope)
    .selectFrom('leagues')
    .select('name')
    .where('id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return league?.name;
}
