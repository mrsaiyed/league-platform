// Which kept statistic a tap records (S-93, step 2.241, T-391): the scoring screen offers,
// and the server takes, a play only of a statistic the season keeps ("Statistics kept",
// P7 §1). Points and fouls are kept in every season that tracks games live (a season
// keeping points only cannot track live), so only the turnovers, a player's and the
// team's, and the taps that take one back, name a statistic a season may not keep.
// Every other tap (line-ups, the clock, timeouts, substitutions) is no statistic.
import { statisticsKept } from './statistics-kept.ts';

const statisticOf: Readonly<Record<string, string>> = {
  turnover: 'turnovers',
  unturnover: 'turnovers',
  'team-turnover': 'turnovers',
  'team-unturnover': 'turnovers',
};

/** The statistic a tap of this type records, or undefined for a tap that records none. */
export function statisticOfTap(type: string): string | undefined {
  return Object.hasOwn(statisticOf, type) ? statisticOf[type] : undefined;
}

/**
 * The statistics the scoring screen offers and the server takes for a season: its
 * "Statistics kept", as the public pages count them (statisticsKept, step 2.196). A tap
 * of no statistic is always taken.
 */
export function keptForScoring(seasonRules: unknown): readonly string[] {
  return statisticsKept([], seasonRules);
}

/** Whether a tap of this type records a statistic the season does not keep. */
export function tapNotKept(type: string, kept: readonly string[]): string | undefined {
  const statistic = statisticOfTap(type);
  return statistic === undefined || kept.includes(statistic) ? undefined : statistic;
}
