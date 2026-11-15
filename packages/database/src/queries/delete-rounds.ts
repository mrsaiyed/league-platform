// Removes rounds of a season of the scope's league that no game is in, in the bin or not,
// as a publication removes them (step 2.160): how many went. A round a game names stays
// (the games' foreign key would refuse it anyway), so the count tells the caller.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function deleteRounds(
  scope: LeagueScope,
  seasonId: string,
  roundIds: readonly string[],
): Promise<number> {
  if (roundIds.length === 0) return 0;
  const rows = await transactionOf(scope)
    .deleteFrom('rounds')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', 'in', [...roundIds])
    .where(
      sql<boolean>`not exists (select 1 from games g
        where g.league_id = rounds.league_id and g.round_id = rounds.id)`,
    )
    .returning('id')
    .execute();
  return rows.length;
}
