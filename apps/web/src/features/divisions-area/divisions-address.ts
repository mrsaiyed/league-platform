// The address of Admin → Season settings → Divisions for one season, built by the one
// address helper (T-34): `/{league}/admin/season/divisions?season=fall-2026`, and a
// division's own place on it, so a phone opens where the change was made.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

export const addDivisionAnchor = 'add-division';
export const divisionsListAnchor = 'divisions';
export const divisionAnchor = (divisionId: string) => `division-${divisionId}`;

const slugShape = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function divisionsAddress(league: LeagueAddressee, seasonSlug?: string): string {
  const base = leagueUrl(league, 'admin-area', { area: 'season', subpath: ['divisions'] });
  return seasonSlug !== undefined && slugShape.test(seasonSlug)
    ? `${base}?${new URLSearchParams({ season: seasonSlug }).toString()}`
    : base;
}
