// U-9: a league is not visible until its organizer publishes it. Live and archived:
// everyone (archived is read-only). To everyone else a hidden league is not there
// at all: the same "not found" as a short name nobody has, so its existence is not
// given away.
//
// - Draft: everyone with an admin area in it (P2, U-9 decided for the founder on
//   2026-11-13, step 2.87): the owner, admins, schedulers, registrars, editors,
//   scorekeepers and club admins, at any scope, so staff can prepare before launch.
//   "An admin area" is exactly what opens the admin (openAdminAreas), so whoever
//   the draft shows its admin to is whoever may see the draft. Coaches and
//   captains, whose tools are on the team page, see it once it is published.
// - Suspended: taken down by us, so only the owner and those who hold the league's
//   settings (`league.settings`) for the whole league, the admin role, see it, to
//   export their data.
//
// The holder is what the session's account holds in this one league, read by the
// access module inside that league's fence: a grant in another league is not here.
import { allows, leagueScope, type AccessHolder } from '../../access/index.ts';
import type { LeagueStatus } from '../league-values.ts';
import { openAdminAreas } from './admin-area-access.ts';

/** The states only some of the league's own people can see. */
export const hiddenLeagueStatuses: readonly LeagueStatus[] = ['draft', 'suspended'];

export function isLeagueHidden(status: LeagueStatus): boolean {
  return hiddenLeagueStatuses.includes(status);
}

/** Whether `holder` may see the league while it is a draft: anyone with an admin area. */
export function maySeeDraftLeague(holder: AccessHolder | undefined): boolean {
  return openAdminAreas(holder).length > 0;
}

/** Whether `holder` may see the league while it is suspended: its owner and admins. */
export function maySeeSuspendedLeague(holder: AccessHolder | undefined): boolean {
  return holder !== undefined && allows(holder, 'league.settings', leagueScope);
}

/** Whether a league in `status` may be shown to `holder` (undefined: a visitor). */
export function mayOpenLeague(status: LeagueStatus, holder: AccessHolder | undefined): boolean {
  switch (status) {
    case 'live':
    case 'archived':
      return true;
    case 'draft':
      return maySeeDraftLeague(holder);
    case 'suspended':
      return maySeeSuspendedLeague(holder);
  }
}
