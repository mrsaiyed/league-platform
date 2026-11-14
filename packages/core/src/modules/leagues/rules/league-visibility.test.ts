import { describe, expect, it } from 'vitest';
import { roles, type AccessHolder, type Grant, type Role, type Scope } from '../../access/index.ts';
import { leagueStatuses } from '../league-values.ts';
import {
  isLeagueHidden,
  mayOpenLeague,
  maySeeDraftLeague,
  maySeeSuspendedLeague,
} from './league-visibility.ts';

const me = '01900000-0000-7000-8000-0000000000a1';
const someoneElse = '01900000-0000-7000-8000-0000000000a2';
const program: Scope = { type: 'program', id: '01900000-0000-7000-8000-0000000000c1' };

const grant = (role: Role, scope: Scope = { type: 'league' }, accountId = me): Grant => ({
  id: `g-${role}`,
  accountId,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});
const holding = (...grants: Grant[]): AccessHolder => ({ accountId: me, isOwner: false, grants });
const owner: AccessHolder = { accountId: me, isOwner: true, grants: [] };

/** The roles with an area of the admin (P4 §4), and those whose tools are on the team page. */
const staffRoles: readonly Role[] = [
  'admin',
  'registrar',
  'scheduler',
  'editor',
  'scorekeeper',
  'club_admin',
];
const teamRoles: readonly Role[] = ['coach', 'captain'];

describe('mayOpenLeague (U-9)', () => {
  it('shows live and archived leagues to everyone', () => {
    for (const status of ['live', 'archived'] as const) {
      expect(isLeagueHidden(status)).toBe(false);
      expect(mayOpenLeague(status, undefined)).toBe(true);
      expect(mayOpenLeague(status, holding())).toBe(true);
      expect(mayOpenLeague(status, holding(grant('coach')))).toBe(true);
      expect(mayOpenLeague(status, owner)).toBe(true);
    }
  });

  it('hides draft and suspended leagues from visitors and plain members', () => {
    for (const status of ['draft', 'suspended'] as const) {
      expect(isLeagueHidden(status)).toBe(true);
      expect(mayOpenLeague(status, undefined)).toBe(false);
      expect(mayOpenLeague(status, holding())).toBe(false);
      expect(mayOpenLeague(status, owner)).toBe(true);
      expect(mayOpenLeague(status, holding(grant('admin')))).toBe(true);
    }
  });

  it('has an answer for every state', () => {
    for (const status of leagueStatuses)
      expect(typeof mayOpenLeague(status, undefined)).toBe('boolean');
  });
});

describe('a draft league is seen by everyone with an admin area in it (step 2.87)', () => {
  it('lets in each staff role, for the whole league or for one program', () => {
    for (const role of staffRoles) {
      expect(maySeeDraftLeague(holding(grant(role)))).toBe(true);
      expect(mayOpenLeague('draft', holding(grant(role)))).toBe(true);
      expect(mayOpenLeague('draft', holding(grant(role, program)))).toBe(true);
    }
  });

  it('covers every role there is: staff, or team roles with no admin area', () => {
    expect([...staffRoles, ...teamRoles].toSorted()).toEqual([...roles].toSorted());
  });

  it('keeps out coaches and captains, who have no admin area', () => {
    for (const role of teamRoles) {
      expect(mayOpenLeague('draft', holding(grant(role)))).toBe(false);
      expect(mayOpenLeague('draft', holding(grant(role, program)))).toBe(false);
    }
  });

  it('keeps out a staff role that was removed', () => {
    for (const role of staffRoles) {
      const ended = { ...grant(role), revokedAt: '2026-11-01T00:00:00Z' };
      expect(mayOpenLeague('draft', holding(ended))).toBe(false);
    }
  });

  it("counts only the account's own grants", () => {
    for (const role of staffRoles) {
      expect(mayOpenLeague('draft', holding(grant(role, { type: 'league' }, someoneElse)))).toBe(
        false,
      );
    }
  });
});

describe('a suspended league is seen only by its owner and admins (U-9)', () => {
  it('keeps out every other role, an admin of one program only, and a removed admin', () => {
    for (const role of roles.filter((r) => r !== 'admin')) {
      expect(maySeeSuspendedLeague(holding(grant(role)))).toBe(false);
      expect(mayOpenLeague('suspended', holding(grant(role)))).toBe(false);
    }
    expect(maySeeSuspendedLeague(holding(grant('admin', program)))).toBe(false);
    const ended = { ...grant('admin'), revokedAt: '2026-11-01T00:00:00Z' };
    expect(maySeeSuspendedLeague(holding(ended))).toBe(false);
    expect(maySeeSuspendedLeague(owner)).toBe(true);
    expect(maySeeSuspendedLeague(undefined)).toBe(false);
  });
});
