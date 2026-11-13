// Shared by the statistics calculations in this folder; not exported from index.ts.
import type { StatsGame, StatTotal } from './types.ts';

export type Accumulator = { total: number; gamesRecorded: number };

export function finishStatTotal(entry: Accumulator): StatTotal {
  return {
    total: entry.total,
    gamesRecorded: entry.gamesRecorded,
    average: entry.gamesRecorded === 0 ? 0 : entry.total / entry.gamesRecorded,
  };
}

export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A stat by key, ignoring inherited names such as "constructor". */
export function ownStat<T>(stats: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(stats, key) ? stats[key] : undefined;
}

/** One player's counted line in one final game, after merging duplicate lines. */
export type PlayerGame = {
  gameId: string;
  teamId: string;
  personId: string;
  secondsPlayed: number | null;
  stats: Record<string, number>;
};

/**
 * The lines that count: those of final games (S-11, so forfeits, postponed and
 * cancelled games are ignored even if they carry lines), for players who entered
 * (P7 §5.6). If the same person has several lines in one game, they are merged into
 * one: stats and seconds add up, the game counts once, and the team of the first
 * line is kept.
 */
export function countedPlayerGames(games: readonly StatsGame[]): PlayerGame[] {
  const merged = new Map<string, PlayerGame>();
  for (const game of games) {
    if (game.status !== 'final') continue;
    for (const line of game.lines) {
      if (!line.played) continue;
      const key = `${game.gameId}\u0000${line.personId}`;
      const target = merged.get(key) ?? {
        gameId: game.gameId,
        teamId: line.teamId,
        personId: line.personId,
        secondsPlayed: null,
        stats: {},
      };
      merged.set(key, target);
      if (line.secondsPlayed !== null) {
        target.secondsPlayed = (target.secondsPlayed ?? 0) + line.secondsPlayed;
      }
      for (const [stat, value] of Object.entries(line.stats)) {
        Object.defineProperty(target.stats, stat, {
          value: (Object.hasOwn(target.stats, stat) ? (target.stats[stat] ?? 0) : 0) + value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
  }
  return [...merged.values()];
}
