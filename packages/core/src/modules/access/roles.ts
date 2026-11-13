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

// Each permission belongs to one area of the admin (P4 §3); the role table below
// gives each role the areas P4 §4 names. Removing something to the bin needs the
// permission of its area; restoring it needs `bin.restore`.
export const permissions = [
  // League settings (P4 §6): profile, address, state, features, wording, privacy.
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
  // Season settings (P4 §3, P7 §1): add a season, its name, dates, status and
  // whether it is current, its rules document and its roster settings.
  'season.settings',
  // Divisions, which P7 §1 lists among the season settings.
  'divisions.manage',
  // Registration (P6).
  'registration.manage',
  'registration.read_answers',
  // People (P4 §3, P6 §7): the list, adding and fixing people, their private
  // fields (R-16, T-76), and importing a list. Importing teams with their rosters
  // needs the teams permissions as well.
  'people.read',
  'people.manage',
  'people.read_sensitive',
  'people.import',
  // Teams (P4 §3): teams, and who is on their rosters.
  'teams.manage',
  'rosters.manage',
  // Schedule (P4 §3): venues and courts, the draft, publishing, and importing a
  // schedule from a spreadsheet (P7 §4 "Also").
  'schedule.read',
  'schedule.edit',
  'schedule.publish',
  'schedule.import',
  'venues.manage',
  // Games (P4 §3, P7 §5). `games.manage`: assign and unassign scorekeepers.
  // `games.score`: record a game, live, as a box score afterwards or as a final
  // score only (T6 §9). `games.results`: an outcome no one played: a forfeit, a
  // postponement, a cancellation (P7 §5.6). `games.correct`: reopen a final game
  // with a reason (T6 §8, S-7).
  'games.manage',
  'games.score',
  'games.results',
  'games.correct',
  // Standings and stats (P4 §3, S-10): an adjustment with a reason.
  'standings.adjust',
  // The bin (A-5, P4 §5): list what was removed and restore it.
  'bin.restore',
  // Site (P5).
  'site.edit',
  'site.publish',
  'content.edit',
  // Messages (P8).
  'messages.send',
  // A team's own tools (P4 §4: coaches and captains).
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
    'people.import',
  ],
  // Schedule and Games (P4 §3: the schedule area includes venues; games includes
  // entering and correcting scores and recording a forfeit).
  scheduler: [
    'schedule.read',
    'schedule.edit',
    'schedule.publish',
    'schedule.import',
    'venues.manage',
    'games.manage',
    'games.score',
    'games.results',
    'games.correct',
  ],
  // Site, news, media, awards, sponsors.
  editor: ['site.edit', 'site.publish', 'content.edit'],
  // Score games, and nothing else. Which games (any, or only assigned ones) is the
  // league's choice, decided by the games module (P4 §4).
  scorekeeper: ['games.score', 'schedule.read'],
  // Their own club's teams, rosters and registrations; reads the schedule.
  club_admin: ['teams.manage', 'rosters.manage', 'registration.manage', 'schedule.read'],
  // Their own team: roster changes the league allows, lineup, messaging the team.
  coach: ['rosters.manage', 'team.lineup', 'team.message'],
  captain: ['rosters.manage', 'team.lineup', 'team.message'],
};

/** Whether `value` is one of the named permissions. Anything else is denied. */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (permissions as readonly string[]).includes(value);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
