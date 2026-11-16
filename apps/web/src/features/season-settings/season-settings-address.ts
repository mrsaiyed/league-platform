// The address of Admin → Season settings for one season, built by the one address helper
// (T-34), with what the page is asked to say or ask in its query: `?season=winter-2027`,
// `&ask=show`, `&done=shown`. The panel's own anchor, so a phone opens at the panel.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

export const visibilityAnchor = 'who-can-see';

export function seasonSettingsAddress(
  league: LeagueAddressee,
  seasonSlug?: string,
  more: Readonly<Record<string, string>> = {},
): string {
  const base = leagueUrl(league, 'admin-area', { area: 'season' });
  const query = new URLSearchParams({
    ...(seasonSlug === undefined ? {} : { season: seasonSlug }),
    ...more,
  }).toString();
  return query === '' ? base : `${base}?${query}`;
}
