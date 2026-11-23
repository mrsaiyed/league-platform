// Where Admin → Standings and stats and its parts are (step 2.56), by the one address
// helper (T-34).
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

export const addAdjustmentAnchor = 'add-adjustment';
export const adjustmentsListAnchor = 'adjustments';
export const adjustmentAnchor = (adjustmentId: string) => `adjustment-${adjustmentId}`;

/** The area's page, for a season other than the current one with `?season=`. */
export function standingsAreaAddress(league: LeagueAddressee, season?: string): string {
  const base = leagueUrl(league, 'admin-area', { area: 'standings' });
  // As Season settings does: whatever the form held, it is only a query's value.
  return season === undefined || season === ''
    ? base
    : `${base}?${new URLSearchParams({ season }).toString()}`;
}
