import { describe, expect, it } from 'vitest';
import { roles, type AccessHolder, type Grant, type Role, type Scope } from '../../access/index.ts';
import { leagueStatuses } from '../league-values.ts';
import { isLeagueHidden, mayOpenLeague, maySeeHiddenLeague } from './league-visibility.ts';

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
const owner: AccessHolder = { accountId: me, isOwner: true, grants: [] };

describe('mayOpenLeague (U-9)', () => {
  it('shows live and archived leagues to everyone', () => {
    for (const status of ['live', 'archived'] as const) {
      expect(mayOpenLeague(status, undefined)).toBe(true);
      expect(mayOpenLeague(status, holding(grant('coach')))).toBe(true);
      expect(mayOpenLeague(status, owner)).toBe(true);
    }
  });

  it('shows draft and suspended leagues only to the owner and admins', () => {
    for (const status of ['draft', 'suspended'] as const) {
      expect(isLeagueHidden(status)).toBe(true);
      expect(mayOpenLeague(status, undefined)).toBe(false);
      expect(mayOpenLeague(status, holding())).toBe(false);
      expect(mayOpenLeague(status, owner)).toBe(true);
      expect(mayOpenLeague(status, holding(grant('admin')))).toBe(true);
    }
  });

  it('reads "admins" literally: no other role, and no admin of one program only', () => {
    for (const role of roles.filter((r) => r !== 'admin')) {
      expect(maySeeHiddenLeague(holding(grant(role)))).toBe(false);
    }
    expect(maySeeHiddenLeague(holding(grant('admin', program)))).toBe(false);
    const ended = { ...grant('admin'), revokedAt: '2026-11-01T00:00:00Z' };
    expect(maySeeHiddenLeague(holding(ended))).toBe(false);
  });

  it('has an answer for every state', () => {
    for (const status of leagueStatuses)
      expect(typeof mayOpenLeague(status, undefined)).toBe('boolean');
  });
});
