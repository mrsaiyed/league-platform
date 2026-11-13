// A game's player lines (T3 §8). The public read decides which a viewer may see.
import type { GamePlayerLine } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGamePlayerLines(
  scope: LeagueScope,
  gameId: string,
): Promise<GamePlayerLine[]> {
  const rows = await transactionOf(scope)
    .selectFrom('player_game_stats')
    .select(['team_id', 'person_id', 'jersey_number', 'played', 'seconds_played', 'stats'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .orderBy('team_id')
    .orderBy('person_id')
    .execute();
  return rows.map((row) => ({
    teamId: row.team_id,
    personId: row.person_id,
    jerseyNumber: row.jersey_number,
    played: row.played,
    secondsPlayed: row.seconds_played,
    stats: row.stats,
  }));
}
