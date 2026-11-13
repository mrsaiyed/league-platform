// Team totals (P7 §6; S-22): shown where a team's player numbers are hidden.
import { byText, finishStatTotal, type Accumulator } from './helpers.ts';
import type { StatsGame, TeamSeasonTotals } from './types.ts';

/**
 * Totals per team from final games. Built from every line of the team, so they exist
 * for every team whether or not its players' numbers are shown. A stat counts a game
 * as recorded when any line of the team has it.
 */
export function teamTotals(games: readonly StatsGame[]): TeamSeasonTotals[] {
  type Team = { gameIds: Set<string>; stats: Map<string, Accumulator> };
  const teams = new Map<string, Team>();
  const team = (id: string): Team => {
    const found: Team = teams.get(id) ?? { gameIds: new Set<string>(), stats: new Map() };
    teams.set(id, found);
    return found;
  };
  for (const game of games) {
    if (game.status !== 'final') continue;
    team(game.homeTeamId).gameIds.add(game.gameId);
    team(game.awayTeamId).gameIds.add(game.gameId);
    const perTeam = new Map<string, Map<string, number>>();
    for (const line of game.lines) {
      if (!line.played) continue;
      const sums = perTeam.get(line.teamId) ?? new Map<string, number>();
      perTeam.set(line.teamId, sums);
      for (const [key, value] of Object.entries(line.stats)) {
        sums.set(key, (sums.get(key) ?? 0) + value);
      }
    }
    for (const [teamId, sums] of perTeam) {
      const target = team(teamId);
      target.gameIds.add(game.gameId);
      for (const [key, value] of sums) {
        const entry = target.stats.get(key) ?? { total: 0, gamesRecorded: 0 };
        entry.total += value;
        entry.gamesRecorded += 1;
        target.stats.set(key, entry);
      }
    }
  }
  return [...teams.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([teamId, value]) => ({
      teamId,
      finalNonForfeitGames: value.gameIds.size,
      stats: Object.fromEntries(
        [...value.stats.entries()].map(([key, entry]) => [key, finishStatTotal(entry)]),
      ),
    }));
}
