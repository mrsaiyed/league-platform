// U-9: a league is not visible until its organizer publishes it. Draft: only the
// people who run it see it. Live and archived: everyone (archived is read-only).
// Suspended: taken down by us, so only the people who run it see it, to export
// their data. To everyone else a hidden league is not there at all: the same "not
// found" as a short name nobody has, so its existence is not given away.
//
// "The people who run it" are those with at least one area of the admin (the owner,
// admins and the staff roles of P4 §4; openAdminAreas). Coaches and captains, who do
// not use the admin, see it once it is published.
import type { LeagueStatus } from '../league-values.ts';

/** The states only the league's own people can see. */
export const hiddenLeagueStatuses: readonly LeagueStatus[] = ['draft', 'suspended'];

export function isLeagueHidden(status: LeagueStatus): boolean {
  return hiddenLeagueStatuses.includes(status);
}

/** Whether a league in `status` may be shown to someone who does or does not run it. */
export function mayOpenLeague(status: LeagueStatus, runsTheLeague: boolean): boolean {
  return runsTheLeague || !isLeagueHidden(status);
}
