// A season's player totals as stored (T3 §9), by person.
import type { PlayerTotalsRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listPlayerSeasonTotals(
  scope: LeagueScope,
  seasonId: string,
): Promise<PlayerTotalsRecord[]> {
  const rows = await transactionOf(scope)
    .selectFrom('season_player_totals')
    .select(['person_id', 'games_played', 'seconds_played', 'seconds_games', 'stats'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .orderBy('person_id')
    .execute();
  return rows.map((row) => ({
    personId: row.person_id,
    gamesPlayed: row.games_played,
    secondsPlayed: row.seconds_played,
    secondsGames: row.seconds_games,
    stats: row.stats,
  }));
}
