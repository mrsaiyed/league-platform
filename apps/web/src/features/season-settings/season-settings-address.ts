// The address of Admin → Season settings for one season, built by the one address helper
// (T-34), with what the page is asked to say or ask in its query: `?season=winter-2027`,
// `&ask=show`, `&done=shown`, or which part's form to draw (`&edit=game`, step 2.47). The
// panel's own anchor, so a phone opens at the panel.
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

/** A part's form, on a step of its own (step 2.47): `?season=fall-2026&edit=game#season-game`. */
export function partAddress(
  league: LeagueAddressee,
  seasonSlug: string,
  part: string,
  anchor: string,
): string {
  return `${seasonSettingsAddress(league, seasonSlug, { edit: part })}#${anchor}`;
}

/**
 * Whether Season settings' Divisions screen exists (step 2.49 builds it, under this area):
 * the link to it is drawn only once it does. Step 2.49 sets this when its page lands.
 */
export const divisionsScreenBuilt = false;

/** The address of the season's divisions (step 2.49), by the one address helper. */
export function divisionsAddress(league: LeagueAddressee, seasonSlug: string): string {
  const base = leagueUrl(league, 'admin-area', { area: 'season', subpath: ['divisions'] });
  return `${base}?${new URLSearchParams({ season: seasonSlug }).toString()}`;
}
