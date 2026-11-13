// Season totals per player (P7 §6, §8; S-11; T6 §9).
import { byText, countedPlayerGames, finishStatTotal, type Accumulator } from './helpers.ts';
import type { PlayerSeasonTotals } from './types.ts';
import type { StatsGame } from './types.ts';

export type SeasonTotalsOptions = {
  /**
   * Teams whose player numbers are hidden (S-22): their lines are left out, so a
   * player on a hidden and a visible team shows only the visible team's numbers.
   */
  hiddenTeamIds?: ReadonlySet<string>;
};

/**
 * Each player's season totals. A game gives a player a "game played" only when the
 * player entered. A stat's average is worked over the games where it was recorded.
 * Duplicate lines of one person in one game count the game once (see helpers.ts).
 */
export function seasonTotals(
  games: readonly StatsGame[],
  options: SeasonTotalsOptions = {},
): PlayerSeasonTotals[] {
  const hidden = options.hiddenTeamIds ?? new Set<string>();
  type Person = {
    teamIds: Set<string>;
    gameIds: Set<string>;
    seconds: Accumulator;
    stats: Map<string, Accumulator>;
  };
  const people = new Map<string, Person>();
  for (const entry of countedPlayerGames(games)) {
    if (hidden.has(entry.teamId)) continue;
    const person: Person = people.get(entry.personId) ?? {
      teamIds: new Set<string>(),
      gameIds: new Set<string>(),
      seconds: { total: 0, gamesRecorded: 0 },
      stats: new Map<string, Accumulator>(),
    };
    people.set(entry.personId, person);
    person.teamIds.add(entry.teamId);
    person.gameIds.add(entry.gameId);
    if (entry.secondsPlayed !== null) {
      person.seconds.total += entry.secondsPlayed;
      person.seconds.gamesRecorded += 1;
    }
    for (const [key, value] of Object.entries(entry.stats)) {
      const stat = person.stats.get(key) ?? { total: 0, gamesRecorded: 0 };
      stat.total += value;
      stat.gamesRecorded += 1;
      person.stats.set(key, stat);
    }
  }
  return [...people.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([personId, person]) => ({
      personId,
      teamIds: [...person.teamIds].sort(byText),
      gamesPlayed: person.gameIds.size,
      seconds: finishStatTotal(person.seconds),
      stats: Object.fromEntries(
        [...person.stats.entries()].map(([key, entry]) => [key, finishStatTotal(entry)]),
      ),
    }));
}
