// The adds of a game in the scope's league that the server refused (record 058): kept as
// events of their own type, with the player's id and why, never a name, so a retry is
// answered the same way and a later batch's commands naming that player still point at
// the refused add. Oldest first.
import { refusedAddEventType } from '@srleagues/contracts';
import type { RefusedAdd } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listRefusedAdds(scope: LeagueScope, gameId: string): Promise<RefusedAdd[]> {
  const rows = await transactionOf(scope)
    .selectFrom('game_events')
    .select(['command_id', 'payload'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('type', '=', refusedAddEventType)
    .orderBy('seq')
    .execute();
  return rows.flatMap((row) => {
    const payload = row.payload as { playerId?: unknown; problem?: unknown };
    return typeof payload.playerId === 'string'
      ? [
          {
            commandId: row.command_id,
            playerId: payload.playerId,
            problem: typeof payload.problem === 'string' ? payload.problem : '',
          },
        ]
      : [];
  });
}
