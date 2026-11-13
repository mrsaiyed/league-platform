import { describe, expect, it } from 'vitest';
import {
  permissions,
  roles,
  type AccessHolder,
  type Grant,
  type Role,
  type Scope,
} from '../../access/index.ts';
import {
  adminAreaPermissions,
  holdsAnywhere,
  mayOpenTracker,
  openAdminAreas,
} from './admin-area-access.ts';
import { adminAreas } from './league-url.ts';

const me = '01900000-0000-7000-8000-0000000000a1';
const program: Scope = { type: 'program', id: '01900000-0000-7000-8000-0000000000c1' };

const grant = (role: Role, scope: Scope = { type: 'league' }): Grant => ({
  id: `g-${role}`,
  accountId: me,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});
const holding = (...grants: Grant[]): AccessHolder => ({ accountId: me, isOwner: false, grants });

describe('openAdminAreas (P4 §3–4)', () => {
  it('opens every area to the owner and to admins', () => {
    expect(openAdminAreas({ accountId: me, isOwner: true, grants: [] })).toEqual(adminAreas);
    expect(openAdminAreas(holding(grant('admin')))).toEqual(adminAreas);
  });

  it('opens nothing to a visitor or someone with no role', () => {
    expect(openAdminAreas(undefined)).toEqual([]);
    expect(openAdminAreas(holding())).toEqual([]);
  });

  it('trims each role to what it can use', () => {
    expect(openAdminAreas(holding(grant('registrar')))).toEqual(['registration', 'people']);
    expect(openAdminAreas(holding(grant('scheduler')))).toEqual(['schedule', 'games']);
    expect(openAdminAreas(holding(grant('editor')))).toEqual(['site']);
    expect(openAdminAreas(holding(grant('scorekeeper')))).toEqual(['games']);
    expect(openAdminAreas(holding(grant('club_admin')))).toEqual(['registration', 'teams']);
  });

  it('gives coaches and captains no admin: their tools are on the team page', () => {
    expect(openAdminAreas(holding(grant('coach')))).toEqual([]);
    expect(openAdminAreas(holding(grant('captain')))).toEqual([]);
  });

  it('opens an area for a role held for one program only', () => {
    expect(openAdminAreas(holding(grant('scheduler', program)))).toEqual(['schedule', 'games']);
  });

  it('ignores ended grants and grants of another account', () => {
    const ended = { ...grant('admin'), revokedAt: '2026-11-13T00:00:00Z' };
    const someoneElse = { ...grant('admin'), accountId: '01900000-0000-7000-8000-0000000000a2' };
    expect(openAdminAreas(holding(ended, someoneElse))).toEqual([]);
  });

  it('names only real permissions, and every role but coach and captain opens something', () => {
    for (const area of adminAreas) {
      for (const p of adminAreaPermissions[area]) expect(permissions).toContain(p);
    }
    for (const role of roles) {
      const opens = openAdminAreas(holding(grant(role))).length > 0;
      expect(opens).toBe(role !== 'coach' && role !== 'captain');
    }
  });
});

describe('mayOpenTracker', () => {
  it('is for whoever may score a game', () => {
    expect(mayOpenTracker(undefined)).toBe(false);
    expect(mayOpenTracker(holding(grant('scorekeeper')))).toBe(true);
    expect(mayOpenTracker(holding(grant('scheduler')))).toBe(true);
    expect(mayOpenTracker(holding(grant('editor')))).toBe(false);
    expect(holdsAnywhere({ accountId: me, isOwner: true, grants: [] }, 'games.score')).toBe(true);
  });
});
