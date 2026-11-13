// The box score lines of a season's decided games (final or forfeit, not in the bin)
// in the scope's league, by game and person: what season totals are worked out from.
// Both tables are filtered to the league (T-28), not only the games.
import type { GameLine } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The counts as stored: whole numbers keyed by stat (is_stat_counts, migration 0010). */
function statCounts(stats: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (typeof stats !== 'object' || stats === null || Array.isArray(stats)) return counts;
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number') counts[key] = value;
  }
  return counts;
}

export async function listDecidedGameLines(
  scope: LeagueScope,
  seasonId: string,
): Promise<readonly GameLine[]> {
  const rows = await transactionOf(scope)
    .selectFrom('player_game_stats as l')
    .innerJoin('games as g', (join) =>
      join.onRef('g.league_id', '=', 'l.league_id').onRef('g.id', '=', 'l.game_id'),
    )
    .select(['l.game_id', 'l.team_id', 'l.person_id', 'l.played', 'l.seconds_played', 'l.stats'])
    .where('l.league_id', '=', scope.leagueId)
    .where('g.league_id', '=', scope.leagueId)
    .where('g.season_id', '=', seasonId)
    .where('g.status', 'in', ['final', 'forfeit'])
    .where('g.deleted_at', 'is', null)
    .orderBy('l.game_id')
    .orderBy('l.person_id')
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
