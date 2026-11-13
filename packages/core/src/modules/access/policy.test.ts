// The permission check on its own: owner, roles, scopes, revoked grants (T-74, T-75).
import { describe, expect, it } from 'vitest';
import { allows, hasPermission, type AccessHolder } from './policy.ts';
import type { Grant, PermissionsTx } from './ports.ts';
import { ownerOnlyPermissions, permissions, rolePermissions, roles } from './roles.ts';
import type { Scope } from './scopes.ts';

const me = '01900000-0000-7000-8000-0000000000a1';
const program = { type: 'program', id: '01900000-0000-7000-8000-0000000000c1' } as const;
const otherProgram = { type: 'program', id: '01900000-0000-7000-8000-0000000000c2' } as const;
const team = { type: 'team', id: '01900000-0000-7000-8000-0000000000d1' } as const;

const grant = (role: Grant['role'], scope: Scope = { type: 'league' }): Grant => ({
  id: `g-${role}`,
  accountId: me,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});
const holder = (...grants: Grant[]): AccessHolder => ({ accountId: me, isOwner: false, grants });

describe('allows', () => {
  it('gives the owner everything, and admins all but the three owner-only things (O-7)', () => {
    const owner = { accountId: me, isOwner: true, grants: [] };
    const admin = holder(grant('admin'));
    for (const p of permissions) {
      expect(allows(owner, p, { type: 'league' })).toBe(true);
      expect(allows(admin, p, { type: 'league' })).toBe(!ownerOnlyPermissions.includes(p));
    }
    expect(ownerOnlyPermissions).toEqual([
      'league.payout',
      'league.transfer_ownership',
      'league.delete',
    ]);
  });

  it('gives each role exactly its own permissions, and access to no role but admin', () => {
    for (const role of roles) {
      const scope: Scope = role === 'coach' || role === 'captain' ? team : { type: 'league' };
      for (const p of permissions) {
        expect(allows(holder(grant(role, scope)), p, scope)).toBe(rolePermissions[role].includes(p));
      }
      expect(allows(holder(grant(role, scope)), 'access.manage', scope)).toBe(role === 'admin');
      expect(allows(holder(grant(role, scope)), 'activity.read', scope)).toBe(role === 'admin');
    }
  });

  it('limits a program role to its program; a league role reaches every program', () => {
    expect(allows(holder(grant('scheduler', program)), 'schedule.edit', program)).toBe(true);
    expect(allows(holder(grant('scheduler', program)), 'schedule.edit', otherProgram)).toBe(false);
    expect(allows(holder(grant('scheduler', program)), 'schedule.edit', { type: 'league' })).toBe(
      false,
    );
    expect(allows(holder(grant('scheduler')), 'schedule.edit', otherProgram)).toBe(true);
    expect(allows(holder(grant('coach', team)), 'team.lineup', { ...team, id: program.id })).toBe(
      false,
    );
  });

  it('ignores a revoked grant and one for someone else', () => {
    expect(allows(holder({ ...grant('admin'), revokedAt: 'now' }), 'access.manage', program)).toBe(
      false,
    );
    expect(allows(holder({ ...grant('admin'), accountId: 'other' }), 'access.manage', program)).toBe(
      false,
    );
  });
});

describe('hasPermission', () => {
  it('reads the owner and the grants on every call, and refuses a visitor', async () => {
    let grants: Grant[] = [grant('editor')];
    let reads = 0;
    const tx: PermissionsTx = {
      jobs: { enqueue: async () => {} },
      access: {
        ownerAccountId: async () => 'someone-else',
        activeGrantsOf: async () => {
          reads += 1;
          return grants;
        },
      },
    };
    const context = { leagueId: 'l', accountId: me, requestId: 'r' };
    expect(await hasPermission(context, tx, 'site.publish')).toBe(true);
    grants = [];
    expect(await hasPermission(context, tx, 'site.publish')).toBe(false);
    expect(reads).toBe(2);
    expect(await hasPermission({ ...context, accountId: null }, tx, 'site.publish')).toBe(false);
  });
});
