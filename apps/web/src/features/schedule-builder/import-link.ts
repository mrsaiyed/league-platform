import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

/** Where Admin → Schedule sends the admin to import fixtures from a spreadsheet (step 2.54). */
export function importLinkOf(addressee: LeagueAddressee): string {
  return leagueUrl(addressee, 'admin-area', { area: 'schedule', subpath: ['import'] });
}
