// The permission table in roles.ts against P4 §4, written out again here by hand
// from the spec's table, row by row, so a change to one that is not made to the
// other fails. (P4 §4 names areas; T4 §4 names the permissions in them.)
import { describe, expect, it } from 'vitest';
import { ownerOnlyPermissions, permissions, rolePermissions, roles } from './roles.ts';

/** P4 §4, one line per role, in the words of the table. */
const p4 = {
  // "The same access as the owner, except handing over ownership, deleting the
  // league and changing the payout account."
  admin: permissions.filter(
    (p) => p !== 'league.transfer_ownership' && p !== 'league.delete' && p !== 'league.payout',
  ),
  // "Registration and People"
  registrar: [
    'registration.manage',
    'registration.read_answers',
    'people.read',
    'people.manage',
    'people.read_sensitive',
  ],
  // "Schedule and Games" (P4 §3: games is entering and correcting scores too)
  scheduler: [
    'schedule.read',
    'schedule.edit',
    'schedule.publish',
    'games.manage',
    'games.score',
    'games.correct',
  ],
  // "Site, news, media, awards, sponsors"
  editor: ['site.edit', 'site.publish', 'content.edit'],
  // "Score games"; a scorekeeper sees a list of their games
  scorekeeper: ['schedule.read', 'games.score'],
  // "Their own club's teams, rosters and registrations. Reads the schedule."
  club_admin: ['teams.manage', 'rosters.manage', 'registration.manage', 'schedule.read'],
  // "Their own team: roster changes the league allows, lineup, messaging the team"
  coach: ['rosters.manage', 'team.lineup', 'team.message'],
  captain: ['rosters.manage', 'team.lineup', 'team.message'],
} as const;

describe('the fixed roles (A-3, O-7, P4 §4)', () => {
  it('are the eight of P4 §4 besides the owner', () => {
    expect([...roles].sort()).toEqual(Object.keys(p4).sort());
  });

  it('each hold exactly what P4 §4 gives them', () => {
    for (const role of roles) {
      expect([...rolePermissions[role]].sort(), role).toEqual([...p4[role]].sort());
    }
  });

  it('keep ownership, deletion and the payout account for the owner alone (O-7)', () => {
    expect([...ownerOnlyPermissions].sort()).toEqual(
      ['league.delete', 'league.payout', 'league.transfer_ownership'].sort(),
    );
    for (const role of roles) {
      for (const p of ownerOnlyPermissions) expect(rolePermissions[role]).not.toContain(p);
    }
  });

  it('give access and the activity log to admins only (A-6)', () => {
    for (const role of roles) {
      expect(rolePermissions[role].includes('access.manage')).toBe(role === 'admin');
      expect(rolePermissions[role].includes('activity.read')).toBe(role === 'admin');
    }
  });

  it('name no permission twice', () => {
    expect(new Set(permissions).size).toBe(permissions.length);
  });
});
