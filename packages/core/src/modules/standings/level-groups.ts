// The sets of teams level after every tiebreaker (S-89): rows of one table that share a
// rank. Worked out from a calculation without the coin flips, they are the teams a flip
// may order; the coin-flip screen names them and the record command accepts only them.
import type { StandingsResult } from '@srleagues/sports';
import type { SeasonCoinFlip } from './ports.ts';

/** Each set of two or more teams sharing a place, in the table's order. */
export function levelGroups(standings: StandingsResult): readonly (readonly string[])[] {
  const groups: string[][] = [];
  for (const table of standings.tables) {
    const byRank = new Map<number, string[]>();
    for (const row of table.rows)
      byRank.set(row.rank, [...(byRank.get(row.rank) ?? []), row.teamId]);
    for (const teamIds of byRank.values()) if (teamIds.length > 1) groups.push(teamIds);
  }
  return groups;
}

/** Whether two lists name the same teams, in any order. */
export function sameTeams(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((teamId) => b.includes(teamId));
}

/** The latest flip naming exactly these teams (the one the calculation uses), if any. */
export function flipFor(
  flips: readonly SeasonCoinFlip[],
  teamIds: readonly string[],
): SeasonCoinFlip | undefined {
  return [...flips].reverse().find((flip) => sameTeams(flip.teamIds, teamIds));
}

/**
 * The flips that order teams (S-89): for each set of teams level after every tiebreaker
 * in `level` (worked out without the flips), the latest flip naming exactly that set. A
 * flip for teams no longer level as a set, because one pulled clear or another joined,
 * orders nobody: it is shown as no longer in use, and taking it off changes nothing.
 */
export function flipsInUse(
  flips: readonly SeasonCoinFlip[],
  level: StandingsResult,
): readonly SeasonCoinFlip[] {
  if (flips.length === 0) return [];
  return levelGroups(level).flatMap((teamIds) => {
    const flip = flipFor(flips, teamIds);
    return flip === undefined ? [] : [flip];
  });
}
