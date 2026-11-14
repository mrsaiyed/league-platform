// Writes box score lines of a game of the scope's league (T3 §8 `player_game_stats`):
// each line added, or replacing the person's line in that game, and the lines of
// `removed` (person ids) taken out, as a live game's undo can leave a player with no
// line. The database keeps one line per person per game, for one of its two teams.
import type { LiveGameLine } from '@srleagues/core';
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function saveGameLines(
  scope: LeagueScope,
  gameId: string,
  lines: readonly LiveGameLine[],
  removed: readonly string[],
): Promise<void> {
  const trx = transactionOf(scope);
  if (removed.length > 0) {
    await trx
      .deleteFrom('player_game_stats')
      .where('league_id', '=', scope.leagueId)
      .where('game_id', '=', gameId)
      .where('person_id', 'in', [...removed])
      .execute();
  }
  if (lines.length === 0) return;
  await trx
    .insertInto('player_game_stats')
    .values(
      lines.map((line) => ({
        league_id: scope.leagueId,
        game_id: gameId,
        team_id: line.teamId,
        person_id: line.personId,
        jersey_number: line.jerseyNumber,
        played: line.played,
        seconds_played: line.secondsPlayed,
        stats: { ...line.stats } as JsonObject,
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(['league_id', 'game_id', 'person_id']).doUpdateSet((eb) => ({
        team_id: eb.ref('excluded.team_id'),
        jersey_number: eb.ref('excluded.jersey_number'),
        played: eb.ref('excluded.played'),
        seconds_played: eb.ref('excluded.seconds_played'),
        stats: eb.ref('excluded.stats'),
      })),
    )
    .execute();
}
