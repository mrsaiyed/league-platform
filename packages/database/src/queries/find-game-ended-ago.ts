// How long ago a game of the scope's league was decided, in milliseconds, measured
// inside the database: the start of this statement (`statement_timestamp()`) less the
// game's `finalized_at`, which the database stamped itself, so one clock gives both
// ends. Not `now()`, which is when the transaction began: the reopen asks only after it
// has waited for the game's lock, and that wait must count. Undefined if the game is not
// here or not decided. The scorekeeper's reopen asks it (step 2.120, record 060).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameEndedAgo(
  scope: LeagueScope,
  gameId: string,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select(
      sql<
        string | null
      >`(extract(epoch from (statement_timestamp() - finalized_at)) * 1000)::bigint::text`.as(
        'ago',
      ),
    )
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .executeTakeFirst();
  if (row === undefined || row.ago === null) return undefined;
  return Math.max(0, Number(row.ago));
}
