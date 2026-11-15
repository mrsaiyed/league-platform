// Takes a player added at the scorer's table off the team in the scope's league (record
// 058): their roster entry goes, and their person too when nothing else holds them (no
// other roster entry, no account, no box score line or season total, no record merged
// into them), so a player added by mistake leaves nothing behind. Refused while the
// person has a box score line in any game: their numbers stay with them. Every table is
// filtered to the league (T-28).
import type { TablePlayerRefusal } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function removeTablePlayer(
  scope: LeagueScope,
  entryId: string,
  personId: string,
): Promise<'removed' | TablePlayerRefusal> {
  const tx = transactionOf(scope);
  const line = await tx
    .selectFrom('player_game_stats')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('person_id', '=', personId)
    .limit(1)
    .executeTakeFirst();
  if (line !== undefined) return 'has-lines';
  await tx
    .deleteFrom('roster_entries')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', entryId)
    .where('person_id', '=', personId)
    .execute();
  await tx
    .deleteFrom('people as p')
    .where('p.league_id', '=', scope.leagueId)
    .where('p.id', '=', personId)
    .where('p.profile_id', 'is', null)
    .where((eb) =>
      eb.and([
        eb.not(
          eb.exists(
            eb
              .selectFrom('roster_entries as r')
              .select('r.id')
              .where('r.league_id', '=', scope.leagueId)
              .whereRef('r.person_id', '=', 'p.id'),
          ),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom('season_player_totals as s')
              .select('s.id')
              .where('s.league_id', '=', scope.leagueId)
              .whereRef('s.person_id', '=', 'p.id'),
          ),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom('people as m')
              .select('m.id')
              .where('m.league_id', '=', scope.leagueId)
              .whereRef('m.merged_into_id', '=', 'p.id'),
          ),
        ),
      ]),
    )
    .execute();
  return 'removed';
}
