// Where Admin → Games → Scorekeepers and its parts are (step 2.56), by the one address
// helper (T-34).
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

export const scorekeepersListAnchor = 'scorekeepers';
export const gameAnchor = (gameId: string) => `game-${gameId}`;
export const assignAnchor = (gameId: string) => `assign-${gameId}`;
export const assignedAnchor = (gameId: string, accountId: string) =>
  `assigned-${gameId}-${accountId}`;

/** The page, for a season other than the current one with `?season=`. */
export function scorekeepersAddress(league: LeagueAddressee, season?: string): string {
  const base = leagueUrl(league, 'admin-area', { area: 'games', subpath: ['scorekeepers'] });
  // As Standings and stats does: whatever the form held, it is only a query's value.
  return season === undefined || season === ''
    ? base
    : `${base}?${new URLSearchParams({ season }).toString()}`;
}
