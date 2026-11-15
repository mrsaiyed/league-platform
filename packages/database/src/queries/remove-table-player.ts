// Takes a player added at the scorer's table off the team in the scope's league (record
// 058, S-45): their roster entry goes, and their person goes to the bin (T-45) when
// nothing else holds them (no other roster entry, no account), so a player added by
// mistake can still be brought back. Refused with `has-lines` while the person has a
// box score line in a game other than `gameId`: their numbers stay with them. This
// game's lines are not looked at: they are rewritten at the end of the batch from its
// plays, which the command has already judged. Run in a savepoint (in-savepoint.ts): a
// refusal is `failed`, never thrown. Every table is filtered to the league (T-28).
import type { TablePlayerRefusal } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { inSavepoint } from './in-savepoint.ts';

export async function removeTablePlayer(
  scope: LeagueScope,
  entryId: string,
  personId: string,
  gameId: string,
): Promise<'removed' | TablePlayerRefusal> {
  const tx = transactionOf(scope);
  const line = await tx
    .selectFrom('player_game_stats')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('person_id', '=', personId)
    .where('game_id', '<>', gameId)
    .limit(1)
    .executeTakeFirst();
  if (line !== undefined) return 'has-lines';
  try {
    return await inSavepoint(scope, async () => {
      await tx
        .deleteFrom('roster_entries')
        .where('league_id', '=', scope.leagueId)
        .where('id', '=', entryId)
        .where('person_id', '=', personId)
        .execute();
      await tx
        .updateTable('people as p')
        .set({ deleted_at: new Date() })
        .where('p.league_id', '=', scope.leagueId)
        .where('p.id', '=', personId)
        .where('p.profile_id', 'is', null)
        .where('p.deleted_at', 'is', null)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom('roster_entries as r')
                .select('r.id')
                .where('r.league_id', '=', scope.leagueId)
                .whereRef('r.person_id', '=', 'p.id'),
            ),
          ),
        )
        .execute();
      return 'removed' as const;
    });
  } catch {
    return 'failed';
  }
}
