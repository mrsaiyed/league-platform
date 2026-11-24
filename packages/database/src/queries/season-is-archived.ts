// Whether a season of the scope's league is archived (O-12, step 2.130): in the state
// `completed` (T-376) and not in the bin. A season that is not there is not archived.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function seasonIsArchived(scope: LeagueScope, seasonId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'completed')
    .executeTakeFirst();
  return row !== undefined;
}
