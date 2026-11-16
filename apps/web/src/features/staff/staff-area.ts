// Where in the admin an address is (step 2.103): whether it is the admin's at all (the
// league's layout then leaves its public header, menu and footer off, and the admin's own
// frame is drawn), and which area's page it is, so the menu can mark it.
import { leagueUrl, type AdminArea, type LeagueAddressee } from '@srleagues/core';

const plain = (address: string): string =>
  (address.split(/[?#]/)[0] ?? '').replace(/\/+$/, '').toLowerCase();

/** The admin's home, or one of its areas. */
export type StaffPlace = 'home' | AdminArea;

/** True for the admin's home and everything under it, with or without a query. */
export function isStaffAddress(league: LeagueAddressee, path: string): boolean {
  const base = plain(leagueUrl(league, 'admin'));
  const at = plain(path);
  return at === base || at.startsWith(`${base}/`);
}

/**
 * The part of the admin `path` (the address as it arrived) is in, among the `areas` this
 * person can use: the home, or the area the page is, or is under (a team under Teams).
 * Null for anything else, an address of no area included.
 */
export function staffPlaceAt(
  league: LeagueAddressee,
  path: string,
  areas: readonly AdminArea[],
): StaffPlace | null {
  const at = plain(path);
  if (at === plain(leagueUrl(league, 'admin'))) return 'home';
  for (const area of areas) {
    const base = plain(leagueUrl(league, 'admin-area', { area }));
    if (at === base || at.startsWith(`${base}/`)) return area;
  }
  return null;
}

/**
 * The areas that have a screen of their own today. The others are listed in the menu with
 * a quiet "Not ready" mark, and their page is a calm panel that says so; which areas are
 * listed at all is steps 2.140 and 2.171's to decide.
 */
export const readyAreas: readonly AdminArea[] = ['teams', 'schedule', 'games', 'settings'];

export const isReadyArea = (area: AdminArea): boolean => readyAreas.includes(area);
