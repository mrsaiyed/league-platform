// Statistical leaders with the league's minimum-games rule (P7 §6).
import { byText, ownStat } from './helpers.ts';
import type { PlayerSeasonTotals, StatTotal } from './types.ts';

/** What to rank by: a recorded stat, or time on court (values in seconds). */
export type LeaderMeasure = { kind: 'stat'; key: string } | { kind: 'seconds' };

export type LeaderBoardOptions = {
  measure: LeaderMeasure;
  by: 'total' | 'average';
  /** The league's minimum games: a whole number, 0 or more. */
  minimumGames: number;
  /**
   * What the minimum counts. `played` (the default, P7 §6 wording) counts games the
   * player entered. `recorded` counts only games where the ranked measure was
   * recorded, so a recorded-once average cannot lead. Which one a league wants is
   * for the founder to confirm.
   */
  minimumGamesBasis?: 'played' | 'recorded';
  /** A whole number, 0 or more. */
  limit?: number;
};

export type Leader = { rank: number; personId: string; value: number; gamesRecorded: number };

function requireCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number, 0 or more`);
  }
}

/**
 * Players ranked by a measure; those without it recorded are not listed. Level
 * players share a rank and the next rank is skipped (1, 2, 2, 4); they are listed in
 * person-id order.
 */
export function leaders(
  players: readonly PlayerSeasonTotals[],
  options: LeaderBoardOptions,
): Leader[] {
  requireCount(options.minimumGames, 'minimumGames');
  if (options.limit !== undefined) requireCount(options.limit, 'limit');
  const basis = options.minimumGamesBasis ?? 'played';
  const rows = players.flatMap((player) => {
    const entry: StatTotal | undefined =
      options.measure.kind === 'seconds'
        ? player.seconds
        : ownStat(player.stats, options.measure.key);
    if (!entry || entry.gamesRecorded === 0) return [];
    const games = basis === 'played' ? player.gamesPlayed : entry.gamesRecorded;
    if (games < options.minimumGames) return [];
    return [
      {
        personId: player.personId,
        value: options.by === 'total' ? entry.total : entry.average,
        gamesRecorded: entry.gamesRecorded,
      },
    ];
  });
  rows.sort((a, b) => b.value - a.value || byText(a.personId, b.personId));
  const ranked: Leader[] = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1];
    const current = ranked[index];
    if (previous && current && previous.value === current.value) current.rank = previous.rank;
  }
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}
