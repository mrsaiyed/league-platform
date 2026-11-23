// The address of Admin → Schedule → Venues, built by the one address helper (T-34):
// `/{league}/admin/schedule/venues`, and a venue's or court's own place on it.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

export const addVenueAnchor = 'add-venue';
export const venuesListAnchor = 'venues';
export const venueAnchor = (venueId: string) => `venue-${venueId}`;
export const courtAnchor = (courtId: string) => `court-${courtId}`;

export function venuesAddress(league: LeagueAddressee): string {
  return leagueUrl(league, 'admin-area', { area: 'schedule', subpath: ['venues'] });
}
