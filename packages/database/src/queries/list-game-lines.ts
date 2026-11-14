// Every box score line of one game in the scope's league, whatever its status, by team
// and person: what the box score grid shows to correct (step 2.64).
import type { GameLine } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { statCounts } from './list-decided-game-lines.ts';

export async function listGameLines(scope: LeagueScope, gameId: string): Promise<GameLine[]> {
  const rows = await transactionOf(scope)
    .selectFrom('player_game_stats')
    .select(['game_id', 'team_id', 'person_id', 'played', 'seconds_played', 'stats'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .orderBy('team_id')
    .orderBy('person_id')
    .execute();
  return rows.map((row) => ({
    gameId: row.game_id,
    teamId: row.team_id,
    personId: row.person_id,
    played: row.played,
    secondsPlayed: row.seconds_played,
    stats: statCounts(row.stats),
  }));
}
