// Each team's record from the counted games, with the admin's adjustments added
// (S-10). Adjustments change wins, losses, ties and standings points, never games
// played, points for and against, the streak or head-to-head, which come from
// games alone. An adjustment that cannot apply is left out and reported.
import { compareGamesByTime, type CountedGame } from './count-games.ts';
import type {
  StandingsAdjustment,
  StandingsProblem,
  StandingsProblemReason,
  StandingsRules,
  Streak,
} from './types.ts';

export interface TeamRecord {
  readonly teamId: string;
  /** Counted games actually played. */
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  /** Standings points; null when the season ranks by win percentage. */
  readonly points: number | null;
  readonly streak: Streak | null;
  readonly adjustments: readonly { readonly adjustmentId: string; readonly reason: string }[];
}

export type GameResult = 'won' | 'lost' | 'tied';

interface Counts {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

const countFields = ['wins', 'losses', 'ties'] as const;

/** How a counted game went for one of its teams. */
export function resultFor(game: CountedGame, teamId: string): GameResult {
  if (game.winnerTeamId === null) return 'tied';
  return game.winnerTeamId === teamId ? 'won' : 'lost';
}

/** Standings points for a record, or null when the season ranks by win percentage. */
export function standingPoints(rules: StandingsRules, record: Counts): number | null {
  const s = rules.standings;
  if (s.rankBy !== 'points') return null;
  return (
    record.wins * s.pointsPerWin + record.ties * s.pointsPerTie + record.losses * s.pointsPerLoss
  );
}

const byAdjustmentId = (a: StandingsAdjustment, b: StandingsAdjustment): number =>
  a.adjustmentId < b.adjustmentId ? -1 : a.adjustmentId > b.adjustmentId ? 1 : 0;

const isWhole = (value: number | undefined): boolean =>
  value === undefined || Number.isInteger(value);

/**
 * The team's adjustments that can apply, and a problem for each that cannot. The
 * choice depends only on the set of adjustments, never on their order.
 */
function usableAdjustments(
  played: Counts,
  adjustments: readonly StandingsAdjustment[],
  rules: StandingsRules,
): { usable: StandingsAdjustment[]; problems: StandingsProblem[] } {
  const problems: StandingsProblem[] = [];
  const problem = (
    adjustment: StandingsAdjustment,
    reason: StandingsProblemReason,
    leftOut = true,
  ): void => {
    problems.push({ kind: 'adjustment', id: adjustment.adjustmentId, reason, leftOut });
  };
  const byPoints = rules.standings.rankBy === 'points';

  let usable: StandingsAdjustment[] = [];
  for (const adjustment of [...adjustments].sort(byAdjustmentId)) {
    const { wins, losses, ties, points } = adjustment;
    if (![wins, losses, ties, points].every(isWhole)) {
      problem(adjustment, 'invalid-adjustment');
      continue;
    }
    const changesRecord = Boolean(wins || losses || ties);
    if (!changesRecord && !(byPoints && points)) {
      problem(adjustment, 'adjustment-has-no-effect');
      continue;
    }
    if (!byPoints && points) problem(adjustment, 'points-ignored-in-win-percentage-season', false);
    usable.push(adjustment);
  }

  // Leave out every adjustment that lowers a count the adjustments together take
  // below zero; repeat, since leaving one out can lower another count.
  for (;;) {
    const negative = countFields.filter(
      (field) => usable.reduce((total, a) => total + (a[field] ?? 0), played[field]) < 0,
    );
    if (negative.length === 0) break;
    const dropped = usable.filter((a) => negative.some((field) => (a[field] ?? 0) < 0));
    for (const adjustment of dropped) problem(adjustment, 'adjustment-makes-count-negative');
    usable = usable.filter((a) => !dropped.includes(a));
  }

  return { usable, problems };
}

export function teamRecord(
  teamId: string,
  games: readonly CountedGame[],
  adjustments: readonly StandingsAdjustment[],
  rules: StandingsRules,
): { record: TeamRecord; problems: StandingsProblem[] } {
  const own = games
    .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
    .sort(compareGamesByTime);

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let scored = 0;
  let allowed = 0;
  for (const game of own) {
    const result = resultFor(game, teamId);
    if (result === 'won') wins++;
    else if (result === 'lost') losses++;
    else ties++;
    if (game.points) {
      const home = game.homeTeamId === teamId;
      scored += home ? game.points.home : game.points.away;
      allowed += home ? game.points.away : game.points.home;
    }
  }

  let streak: Streak | null = null;
  for (let i = own.length - 1; i >= 0; i--) {
    const game = own[i];
    if (!game) break;
    const result = resultFor(game, teamId);
    if (streak === null) streak = { result, length: 1 };
    else if (streak.result === result) streak = { result, length: streak.length + 1 };
    else break;
  }

  const mine = adjustments.filter((adjustment) => adjustment.teamId === teamId);
  const { usable, problems } = usableAdjustments({ wins, losses, ties }, mine, rules);
  const counts = { wins, losses, ties };
  let extraPoints = 0;
  for (const adjustment of usable) {
    counts.wins += adjustment.wins ?? 0;
    counts.losses += adjustment.losses ?? 0;
    counts.ties += adjustment.ties ?? 0;
    extraPoints += adjustment.points ?? 0;
  }

  const earned = standingPoints(rules, counts);
  // Footnotes only for adjustments that changed this row.
  const shown = usable.filter((a) => a.wins || a.losses || a.ties || (earned !== null && a.points));
  return {
    record: {
      teamId,
      gamesPlayed: own.length,
      ...counts,
      pointsFor: scored,
      pointsAgainst: allowed,
      points: earned === null ? null : earned + extraPoints,
      streak,
      adjustments: shown.map(({ adjustmentId, reason }) => ({ adjustmentId, reason })),
    },
    problems,
  };
}
