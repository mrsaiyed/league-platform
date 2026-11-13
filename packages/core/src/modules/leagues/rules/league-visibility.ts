// U-9: a league is not visible until its organizer publishes it. "Draft: only
// admins can see it." Live and archived: everyone (archived is read-only).
// Suspended: taken down by us, so only its admins see it, to export their data. To
// everyone else a hidden league is not there at all: the same "not found" as a
// short name nobody has, so its existence is not given away.
//
// "Admins" is read literally (record 020): the owner and those who hold the league's
// settings (`league.settings`) for the whole league, which is the admin role. Staff
// with other admin areas (schedulers, editors...) and coaches and captains see it
// once it is published. Whether staff should see a draft too is the founder's call.
import { allows, leagueScope, type AccessHolder } from '../../access/index.ts';
import type { LeagueStatus } from '../league-values.ts';

/** The states only the league's admins can see. */
export const hiddenLeagueStatuses: readonly LeagueStatus[] = ['draft', 'suspended'];

export function isLeagueHidden(status: LeagueStatus): boolean {
  return hiddenLeagueStatuses.includes(status);
}

/** Whether `holder` may see the league while it is hidden: its owner and admins. */
export function maySeeHiddenLeague(holder: AccessHolder | undefined): boolean {
  return holder !== undefined && allows(holder, 'league.settings', leagueScope);
}

/** Whether a league in `status` may be shown to `holder` (undefined: a visitor). */
export function mayOpenLeague(status: LeagueStatus, holder: AccessHolder | undefined): boolean {
  return !isLeagueHidden(status) || maySeeHiddenLeague(holder);
}
