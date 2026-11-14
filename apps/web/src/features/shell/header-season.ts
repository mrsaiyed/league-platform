// The season picker of the header (docs/build/DESIGN.md, section 4, line 8): which season
// it shows as chosen, and where choosing another one goes. It is on every page of the menu,
// because each of those is a page of one season. On one of the menu's own pages a new season
// shows the same page, keeping the page's other choices (a team, a round, per game or
// totals). On a page under one (a team) it goes to that menu page: a team of one season is
// not always in another. Pages off the menu (a game, the admin) have no picker.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';
import type { PublicSeason } from '../../server/public-stats.ts';
import { chooseSeason } from '../stats-pages/index.ts';
import { menuPageAt } from './current-menu-page.ts';

export type HeaderSeason = {
  /** Where the picker's form goes: built by the address helper, never by hand. */
  readonly action: string;
  /** The short name of the season the page shows. */
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  /** The page's other choices, carried along. */
  readonly keep: Readonly<Record<string, string>>;
};

/** A choice in the address worth carrying: a plain name, and not the season itself. */
const carried = /^[a-z][a-z0-9_-]{0,31}$/i;
const mostCarried = 8;

/**
 * The header's picker for the address as it arrived, or null when there is nothing to pick:
 * fewer than two seasons, or a page that is not of the menu.
 */
export function headerSeason(
  league: LeagueAddressee,
  path: string,
  seasons: readonly PublicSeason[],
): HeaderSeason | null {
  if (seasons.length < 2) return null;
  const at = menuPageAt(league, path);
  if (at === null) return null;
  const query = new URLSearchParams(path.split('#')[0]?.split('?')[1] ?? '');
  // A season the league does not have is "not found" on the page; the picker then shows the
  // season a visitor would get without asking.
  const shown =
    chooseSeason(seasons, query.get('season') ?? undefined) ?? chooseSeason(seasons, undefined);
  if (shown === undefined) return null;
  const keep = new Map<string, string>();
  if (at.exact) {
    for (const [name, value] of query) {
      if (keep.size >= mostCarried) break;
      if (name !== 'season' && carried.test(name) && value !== '' && !keep.has(name)) {
        keep.set(name, value);
      }
    }
  }
  return {
    action: leagueUrl(league, at.page),
    value: shown.slug,
    options: seasons.map((season) => ({ value: season.slug, label: season.name })),
    keep: Object.fromEntries(keep),
  };
}
