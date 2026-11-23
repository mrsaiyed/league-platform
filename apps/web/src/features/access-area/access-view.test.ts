import type { AccessList, ActivityRecord } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { adminsView, offeredRoles } from './access-view.ts';
import { problemKeyOf, wrongInviteFields } from './access-words.ts';

const owner = '01900000-0000-7000-8000-0000000000a1';
const named = '01900000-0000-7000-8000-0000000000a2';
const unnamed = '01900000-0000-7000-8000-0000000000a3';
const gone = '01900000-0000-7000-8000-0000000000a4';
const league = { type: 'league' } as const;
const grant = (id: string, accountId: string, role: 'admin' | 'scorekeeper' | 'scheduler') => ({
  id,
  accountId,
  role,
  scope: league,
  grantedByAccountId: owner,
  revokedAt: null,
});
const list: AccessList = {
  ownerAccountId: owner,
  grants: [
    grant('g1', unnamed, 'scorekeeper'),
    grant('g2', named, 'admin'),
    grant('g3', named, 'scheduler'),
  ],
  invitations: [
    {
      id: 'i1',
      email: 'older@example.test',
      role: 'scorekeeper',
      scope: league,
      status: 'expired',
      invitedByAccountId: owner,
      expiresAt: '2026-11-01T00:00:00.000Z',
      acceptedByAccountId: null,
    },
    {
      id: 'i2',
      email: 'newer@example.test',
      role: 'admin',
      scope: league,
      status: 'pending',
      invitedByAccountId: owner,
      expiresAt: '2026-12-01T00:00:00.000Z',
      acceptedByAccountId: null,
    },
  ],
};
const names = new Map<string, string | null>([
  [owner, 'Ola Owner'],
  [named, 'Adele Admin'],
  [unnamed, null],
]);
const entry = (n: number, action: string, actor: string | null, role?: string): ActivityRecord => ({
  id: `e${n}`,
  at: `2026-11-1${n}T10:00:00.000Z`,
  actorAccountId: actor,
  action,
  targetType: null,
  targetId: null,
  summary: `activity.${action}`,
  details: role === undefined ? {} : { role },
});

describe('the Admins page, worked out (step 2.97)', () => {
  it('lists the owner first, then people by name, someone with no name last, as "No name yet"', () => {
    const view = adminsView({ list, names, activity: [], you: named });
    expect(view.people.map((p) => [p.name, p.isOwner, p.isYou])).toEqual([
      ['Ola Owner', true, false],
      ['Adele Admin', false, true],
      [null, false, false],
    ]);
    // One line per person, each of their roles with its own grant to remove; the owner none.
    expect(view.people[0]?.grants).toEqual([]);
    expect(view.people[1]?.grants.map((g) => [g.grantId, g.role])).toEqual([
      ['g2', 'admin'],
      ['g3', 'scheduler'],
    ]);
  });

  it('never puts an account’s email address on a person’s line (A-14)', () => {
    const view = adminsView({ list, names, activity: [], you: owner });
    expect(JSON.stringify(view.people)).not.toContain('@');
  });

  it('lists the newest invitation first, saying which have run out', () => {
    const view = adminsView({ list, names, activity: [], you: owner });
    expect(view.invitations.map((i) => [i.email, i.expired])).toEqual([
      ['newer@example.test', false],
      ['older@example.test', true],
    ]);
  });

  it('shows only the changes to who has access, newest first as the log gives them', () => {
    const view = adminsView({
      list,
      names,
      activity: [
        entry(3, 'access.revoke_grant', owner, 'scorekeeper'),
        entry(2, 'leagues.set_name', owner),
        entry(1, 'access.invite', gone, 'admin'),
      ],
      you: owner,
    });
    expect(view.activity).toEqual([
      {
        id: 'e3',
        at: '2026-11-13T10:00:00.000Z',
        who: 'Ola Owner',
        summary: 'activity.access.revoke_grant',
        role: 'scorekeeper',
      },
      // Someone without access now is not named: the names are only of the access list.
      {
        id: 'e1',
        at: '2026-11-11T10:00:00.000Z',
        who: undefined,
        summary: 'activity.access.invite',
        role: 'admin',
      },
    ]);
  });

  it('offers only the roles that can be given for the whole league today', () => {
    expect(offeredRoles).toEqual(['admin', 'registrar', 'scheduler', 'editor', 'scorekeeper']);
  });
});

describe('what a refusal says, and which box it marks', () => {
  it('marks the email or the role the command found not valid', () => {
    expect(wrongInviteFields('invalid-input', [{ path: 'email' }])).toEqual(['email']);
    expect(wrongInviteFields('invalid-input', [{ path: 'role' }])).toEqual(['role']);
    expect(problemKeyOf('invalid-input', ['email'])).toBe('adminAccess.problem.email');
    expect(problemKeyOf('invalid-input', ['role'])).toBe('adminAccess.problem.role');
    expect(wrongInviteFields('already-invited')).toEqual(['email']);
    expect(problemKeyOf('already-invited')).toBe('adminAccess.problem.already-invited');
  });

  it('says a role that cannot be given here, an owner say, is not one of the list', () => {
    expect(problemKeyOf('role-does-not-fit-scope')).toBe('adminAccess.problem.role');
    expect(wrongInviteFields('scope-not-available')).toEqual(['role']);
  });

  it('says "could not be done" for any code it has no sentence for', () => {
    expect(problemKeyOf('something-new')).toBe('adminAccess.problem.unknown');
  });
});
