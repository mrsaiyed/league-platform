// Removes rounds of a season of the scope's league that no game outside the bin is in, as
// a publication removes them (steps 2.160 and 2.181): which went, and which games in the
// bin lost their round. A game in the bin does not hold its round (S-60): in the same
// transaction it loses its round and keeps everything else (teams, date, number), so it
// comes back from the bin with no round; the caller logs both, so the bin can later say
// why. A round a game outside the bin names stays (the games' foreign key would refuse it
// anyway), so the list tells the caller.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function deleteRounds(
  scope: LeagueScope,
  seasonId: string,
  roundIds: readonly string[],
): Promise<{ readonly roundIds: readonly string[]; readonly gameIds: readonly string[] }> {
  if (roundIds.length === 0) return { roundIds: [], gameIds: [] };
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
  if (free.length === 0) return { roundIds: [], gameIds: [] };
  const freeIds = free.map((r) => r.id);
  const cleared = await trx
    .updateTable('games')
    .set({ round_id: null })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('round_id', 'in', freeIds)
    .where('deleted_at', 'is not', null)
    .returning('id')
    .execute();
  // A game brought back from the bin since the rounds were read still names its round,
  // which then stays: the list is short and the caller refuses.
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
  return {
    roundIds: rows.map((r) => r.id).sort(),
    gameIds: cleared.map((g) => g.id).sort(),
  };
}
