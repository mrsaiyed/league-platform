// The fixed roles (A-3) and what each may do (P4 §4, O-7), as data: one table of
// named permissions (T4 §4). Commands name the permission they need and the scope
// it applies to; nothing else in code says what a role may do.
//
// The owner is not a grant: it is the league's own owner account (exactly one,
// O-7), and may do everything. An admin may do everything the owner may except
// hand over ownership, delete the league and change the payout account (O-7).

export const roles = [
  'admin',
  'registrar',
  'scheduler',
  'editor',
  'scorekeeper',
  'club_admin',
  'coach',
  'captain',
] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  // League settings (P4 §6): profile, address, state, seasons, features, wording, privacy.
  'league.settings',
  'league.billing',
  'league.export',
  // Owner only (O-7).
  'league.payout',
  'league.transfer_ownership',
  'league.delete',
  // Who has access: invite, re-send, cancel, remove, see the list.
  'access.manage',
  // A-6: visible to the owner and admins.
  'activity.read',
  'registration.manage',
  'registration.read_answers',
  'people.read',
  'people.manage',
  'people.read_sensitive',
  'teams.manage',
  'rosters.manage',
  'schedule.read',
  'schedule.edit',
  'schedule.publish',
  'games.manage',
  'games.score',
  'games.correct',
  'standings.adjust',
  'site.edit',
  'site.publish',
  'content.edit',
  'messages.send',
  'team.lineup',
  'team.message',
] as const;
export type Permission = (typeof permissions)[number];

/** What only the owner may do (O-7). */
export const ownerOnlyPermissions: readonly Permission[] = [
  'league.payout',
  'league.transfer_ownership',
  'league.delete',
];

/** P4 §4, role by role. The owner has every permission and is not in this table. */
export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  admin: permissions.filter((p) => !ownerOnlyPermissions.includes(p)),
  // Registration and People.
  registrar: [
    'registration.manage',
    'registration.read_answers',
    'people.read',
    'people.manage',
    'people.read_sensitive',
  ],
  // Schedule and Games (P4 §3: games includes entering and correcting scores).
  scheduler: [
    'schedule.read',
    'schedule.edit',
    'schedule.publish',
    'games.manage',
    'games.score',
    'games.correct',
  ],
  // Site, news, media, awards, sponsors.
  editor: ['site.edit', 'site.publish', 'content.edit'],
  // Score games. Which games (any, or only assigned ones) is the league's choice,
  // decided by the games module when it exists.
  scorekeeper: ['games.score', 'schedule.read'],
  // Their own club's teams, rosters and registrations; reads the schedule.
  club_admin: ['teams.manage', 'rosters.manage', 'registration.manage', 'schedule.read'],
  // Their own team: roster changes the league allows, lineup, messaging the team.
  coach: ['rosters.manage', 'team.lineup', 'team.message'],
  captain: ['rosters.manage', 'team.lineup', 'team.message'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
