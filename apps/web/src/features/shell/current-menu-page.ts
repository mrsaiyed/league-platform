// Which page of the menu an address is on, so the menu can mark it (aria-current). A page
// under one of the menu's pages (a team under Teams) marks that page.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

/** The pages of a league's menu, in the order they are shown. */
export const menuPages = ['home', 'schedule', 'standings', 'stats', 'teams'] as const;

export type MenuPage = (typeof menuPages)[number];

const plain = (address: string): string =>
  (address.split(/[?#]/)[0] ?? '').replace(/\/+$/, '').toLowerCase();

/**
 * The menu page `path` (the address as it arrived, with or without a query) is on or under;
 * `exact` says it is that page itself. Null for a page the menu does not hold.
 */
export function menuPageAt(
  league: LeagueAddressee,
  path: string,
): { readonly page: MenuPage; readonly exact: boolean } | null {
  const at = plain(path);
  for (const page of menuPages) {
    const base = plain(leagueUrl(league, page));
    if (at === base) return { page, exact: true };
    if (page !== 'home' && at.startsWith(`${base}/`)) return { page, exact: false };
  }
  return null;
}

/** The menu page `path` is on, so the menu can mark it; null for none. */
export function currentMenuPage(league: LeagueAddressee, path: string): MenuPage | null {
  return menuPageAt(league, path)?.page ?? null;
}
