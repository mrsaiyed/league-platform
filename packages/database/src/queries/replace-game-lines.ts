// Replaces every box score line of a game in the scope's league with the ones given
// (step 2.64): the old lines are removed and the new ones written, in the caller's
// transaction. The database refuses a line for a team not in the game, a person twice
// or a person of another league (migration 0010).
import type { NewGameLine } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function replaceGameLines(
  scope: LeagueScope,
  gameId: string,
  lines: readonly NewGameLine[],
): Promise<void> {
  const trx = transactionOf(scope);
  await trx
    .deleteFrom('player_game_stats')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .execute();
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
        stats: { ...line.stats },
      })),
    )
    .execute();
}
