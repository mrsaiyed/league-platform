// Adds the taps a batch took to a game of the scope's league (T3 §8 `game_events`), in
// order. The database keeps each command id and each seq once per game and seq with no
// gaps (T3 §12), and refuses a game of another league (game_events_game, T-60).
import type { NewGameEvent } from '@srleagues/core';
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertGameEvents(
  scope: LeagueScope,
  events: readonly NewGameEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await transactionOf(scope)
    .insertInto('game_events')
    .values(
      events.map((event) => ({
        league_id: scope.leagueId,
        game_id: event.gameId,
        seq: event.seq,
        command_id: event.commandId,
        type: event.type,
        payload: event.payload as JsonObject,
        tapped_at: new Date(event.tappedAt),
        account_id: event.accountId,
      })),
    )
    .execute();
}
