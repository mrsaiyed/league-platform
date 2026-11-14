import type { PublicSeason } from '../../server/public-stats.ts';

/**
 * The season a page shows: the one `?season=` names (its short name in the address, P2 §4),
 * else the league's current season, else the newest. Undefined for a name that is not one of
 * the league's seasons (the page is then "not found") or when there are no seasons at all.
 */
export function chooseSeason(
  seasons: readonly PublicSeason[],
  asked: string | undefined,
): PublicSeason | undefined {
  if (asked !== undefined && asked !== '') return seasons.find((s) => s.slug === asked);
  return seasons.find((s) => s.isCurrent) ?? seasons[0];
}

/** The `?season=` value of a page's address: the first one given, if any. */
export function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}
