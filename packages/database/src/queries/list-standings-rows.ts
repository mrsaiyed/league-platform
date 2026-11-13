// A season's calculated standings rows (T3 §9), by place then seed.
import type { StandingsRowRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listStandingsRows(
  scope: LeagueScope,
  seasonId: string,
): Promise<StandingsRowRecord[]> {
  const rows = await transactionOf(scope)
    .selectFrom('standings_rows')
    .select([
      'team_id',
      'division_id',
      'rank',
      'seed',
      'games_played',
      'wins',
      'losses',
      'ties',
      'points_for',
      'points_against',
      'standings_points',
      'streak_result',
      'streak_length',
      'decided_by',
    ])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .orderBy('rank')
    .orderBy('seed')
    .orderBy('team_id')
    .execute();
  return rows.map((row) => ({
    teamId: row.team_id,
    divisionId: row.division_id,
    rank: row.rank,
    seed: row.seed,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    pointsFor: row.points_for,
    pointsAgainst: row.points_against,
    standingsPoints: row.standings_points,
    streakResult: row.streak_result,
    streakLength: row.streak_length,
    decidedBy: row.decided_by,
  }));
}
