// Which areas of the admin a person sees (P4 §3–4): "what each role sees is trimmed
// to what they can use". An area opens for anyone who holds one of its permissions,
// at any scope: a scheduler for one program sees Schedule, and the area itself then
// shows only that program (its commands check the scope, T-74). Someone with no area
// does not use the admin at all, like coaches and captains, whose tools are on the
// team page (P4 §4). The admin shell and the address check (U-6) both read this.
import { roleHasPermission, type AccessHolder, type Permission } from '../../access/index.ts';
import { adminAreas, type AdminArea } from './league-url.ts';

/** P4 §3, area by area: the permissions that open it. */
export const adminAreaPermissions: Readonly<Record<AdminArea, readonly Permission[]>> = {
  registration: ['registration.manage'],
  people: ['people.read', 'people.manage'],
  // Club admins run their own club's teams (P4 §4).
  teams: ['teams.manage'],
  // Changing the schedule. Club admins and scorekeepers only read it, on the public site.
  schedule: ['schedule.edit', 'schedule.publish'],
  // A scorekeeper "sees a list of their games and nothing else" (P4 §4).
  games: ['games.manage', 'games.score', 'games.correct'],
  standings: ['standings.adjust'],
  site: ['site.edit', 'site.publish', 'content.edit'],
  messages: ['messages.send'],
  season: ['league.settings'],
  settings: ['league.settings', 'access.manage', 'activity.read', 'league.billing'],
};

/** Whether `holder` holds `permission` anywhere in the league, at any scope. */
export function holdsAnywhere(holder: AccessHolder | undefined, permission: Permission): boolean {
  if (holder === undefined) return false;
  if (holder.isOwner) return true;
  return holder.grants.some(
    (grant) =>
      grant.accountId === holder.accountId &&
      grant.revokedAt === null &&
      roleHasPermission(grant.role, permission),
  );
}

/** The areas of the admin open to `holder`, in the admin's order; none for a visitor. */
export function openAdminAreas(holder: AccessHolder | undefined): readonly AdminArea[] {
  return adminAreas.filter((area) =>
    adminAreaPermissions[area].some((permission) => holdsAnywhere(holder, permission)),
  );
}

/** The courtside tracker (P2 §4): for whoever may score a game here. */
export function mayOpenTracker(holder: AccessHolder | undefined): boolean {
  return holdsAnywhere(holder, 'games.score');
}
