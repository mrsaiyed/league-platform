// Removes rounds of a season of the scope's league that no game outside the bin is in, as
// a publication removes them (steps 2.160 and 2.181): how many went. A game in the bin does
// not hold its round (S-60): in the same transaction it loses its round and keeps
// everything else (teams, date, number), so it comes back from the bin with no round. A
// round a game outside the bin names stays (the games' foreign key would refuse it anyway),
// so the count tells the caller.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function deleteRounds(
  scope: LeagueScope,
  seasonId: string,
  roundIds: readonly string[],
): Promise<number> {
  if (roundIds.length === 0) return 0;
  const trx = transactionOf(scope);
  const free = await trx
    .selectFrom('rounds')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', 'in', [...roundIds])
    .where(
      sql<boolean>`not exists (select 1 from games g
        where g.league_id = rounds.league_id and g.round_id = rounds.id
          and g.deleted_at is null)`,
    )
    .execute();
  if (free.length === 0) return 0;
  const freeIds = free.map((r) => r.id);
  await trx
    .updateTable('games')
    .set({ round_id: null })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('round_id', 'in', freeIds)
    .where('deleted_at', 'is not', null)
    .execute();
  // A game brought back from the bin since the rounds were read still names its round,
  // which then stays: the count is short and the caller refuses.
  const rows = await trx
    .deleteFrom('rounds')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', 'in', freeIds)
    .where(
      sql<boolean>`not exists (select 1 from games g
        where g.league_id = rounds.league_id and g.round_id = rounds.id)`,
    )
    .returning('id')
    .execute();
  return rows.length;
}
