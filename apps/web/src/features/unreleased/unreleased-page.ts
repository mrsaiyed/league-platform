// Which page not built yet an address is, if any (step 2.140, record 087). None of them has
// a route of its own (server/releases.ts): each is answered by the route that answers every
// unknown address at its place, which asks this with the route's own values, the league's
// word first, and draws the page's placeholder only where pages not built yet are shown.
import {
  adminAreas,
  leaguePages,
  platformPages,
  type AdminArea,
  type LeaguePage,
  type PlatformPage,
} from '@srleagues/core';
import type { TextKey } from '../../server/messages.ts';
import {
  adminAreaReleases,
  leaguePageReleases,
  platformPageReleases,
} from '../../server/releases.ts';

/** A placeholder: one of our own pages, a league's page, or an area of the admin. */
export type UnreleasedPage =
  | { readonly kind: 'platform'; readonly page: PlatformPage; readonly title: TextKey }
  | { readonly kind: 'league'; readonly page: LeaguePage; readonly title: TextKey }
  | { readonly kind: 'admin'; readonly area: AdminArea };

/**
 * The pages not built yet that have a placeholder to show in local work and tests, and
 * its title. A page the list says is not built and that is not here (awards, a club, an
 * invitation…) has none yet: it is an unknown address in every mode.
 */
const platformPlaceholders: Partial<Readonly<Record<PlatformPage, TextKey>>> = {
  contact: 'page.contact',
  find: 'page.find',
  help: 'page.help',
  inbox: 'page.inbox',
  start: 'page.start',
  status: 'page.status',
};

const leaguePlaceholders: Partial<Readonly<Record<LeaguePage, TextKey>>> = {
  news: 'nav.news',
  'news-post': 'page.newsPost',
  player: 'page.player',
  register: 'nav.register',
};

/** Whether `parts` (an address's words, `:name` for any one word) spell `address`. */
const spells = (parts: readonly string[], address: readonly string[]): boolean =>
  parts.length === address.length &&
  parts.every((part, at) => {
    const word = address[at] ?? '';
    return part.startsWith(':') ? word !== '' : part === word;
  });

const entries = <K extends string, V>(record: Partial<Readonly<Record<K, V>>>) =>
  Object.entries(record) as [K, V][];

/**
 * The page not built yet at an address, given as the route's values (`[league]` and then
 * `[...missing]`, or `[league]`, `admin` and the admin's `[...missing]`), or null for any
 * other address. Our own pages first: `/account/inbox` is ours, never a league's.
 */
export function unreleasedPageAt(address: readonly string[]): UnreleasedPage | null {
  for (const [page, title] of entries(platformPlaceholders)) {
    if (platformPageReleases[page] === 'not-built' && spells(platformPages[page], address)) {
      return { kind: 'platform', page, title };
    }
  }
  const [, ...below] = address;
  if (below.length === 0) return null;
  if (below[0] === 'admin') {
    const area = adminAreas.find((name) => below.length === 2 && below[1] === name);
    return area !== undefined && adminAreaReleases[area] === 'not-built'
      ? { kind: 'admin', area }
      : null;
  }
  for (const [page, title] of entries(leaguePlaceholders)) {
    if (leaguePageReleases[page] === 'not-built' && spells(leaguePages[page].path, below)) {
      return { kind: 'league', page, title };
    }
  }
  return null;
}
