// The stats the box score grid asks for, from the statistics a game's rules keep (P7
// §1 "Statistics kept"). The command takes any stat key; this only picks the grid's
// columns. "Standard" is P7's default set: points, 3-pointers, free throws and fouls,
// with minutes. "Full" adds the other counts the stats pages already have words for
// (S-25: rebounds, assists, steals, blocks, turnovers).
// The keys are the tracker's: fg3 for 3-pointers made, fg1 for free throws made.
import type { SeasonRules } from '@srleagues/contracts';

const standard = ['points', 'fg3', 'fg1', 'fouls'] as const;

const columns: Readonly<Record<SeasonRules['statistics'], readonly string[]>> = {
  'points-only': ['points'],
  'points-fouls': ['points', 'fouls'],
  standard,
  full: [...standard, 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'],
};

/** The grid's stat columns and whether it asks for minutes. */
export function boxScoreColumns(statistics: SeasonRules['statistics']): {
  readonly statKeys: readonly string[];
  readonly minutes: boolean;
} {
  return {
    statKeys: columns[statistics],
    minutes: statistics === 'standard' || statistics === 'full',
  };
}
