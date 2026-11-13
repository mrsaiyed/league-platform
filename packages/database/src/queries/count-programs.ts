// How many programs the scope's league has, not counting the bin: one means the
// league is a single-program league and nothing shows the program's name (U-3).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function countPrograms(scope: LeagueScope): Promise<number> {
  const rows = await transactionOf(scope)
    .selectFrom('programs')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .execute();
  return rows.length;
}
