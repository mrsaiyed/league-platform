// Role test (step 2.182): who gets "Show this season to visitors" and "Hide it again", by
// the season command's own permission at the season's program: the owner and admins, an
// admin limited to one program on that program's seasons only; never a scheduler, a
// scorekeeper or a visitor; nobody in an archived or suspended league.
import type { AccessHolder, Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { mayShowSeason } from './may-show-season.ts';

const programA = '01900000-0000-7000-8000-00000000a001';
const programB = '01900000-0000-7000-8000-00000000b001';
const account = '01900000-0000-7000-8000-0000000000c1';

const grant = (role: Grant['role'], scope: Grant['scope']): Grant => ({
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: account,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});
const holder = (grants: readonly Grant[], isOwner = false): AccessHolder => ({
  accountId: account,
  isOwner,
  grants,
});
const seasonOfA = { programId: programA };
const seasonOfB = { programId: programB };

describe('mayShowSeason', () => {
  it('lets the owner and a league-wide admin show or hide any season', () => {
    for (const who of [holder([], true), holder([grant('admin', { type: 'league' })])]) {
      expect(mayShowSeason(who, seasonOfA, 'live')).toBe(true);
      expect(mayShowSeason(who, seasonOfB, 'draft')).toBe(true);
    }
  });

  it("lets an admin of program A show A's seasons and not B's", () => {
    const oneProgram = holder([grant('admin', { type: 'program', id: programA })]);
    expect(mayShowSeason(oneProgram, seasonOfA, 'live')).toBe(true);
    expect(mayShowSeason(oneProgram, seasonOfB, 'live')).toBe(false);
  });

  it('never lets a scheduler, a scorekeeper or a visitor', () => {
    for (const role of ['scheduler', 'scorekeeper'] as const) {
      expect(mayShowSeason(holder([grant(role, { type: 'league' })]), seasonOfA, 'live')).toBe(
        false,
      );
    }
    expect(mayShowSeason(undefined, seasonOfA, 'live')).toBe(false);
  });

  it('offers nothing in a league that is archived or suspended', () => {
    expect(mayShowSeason(holder([], true), seasonOfA, 'archived')).toBe(false);
    expect(mayShowSeason(holder([], true), seasonOfA, 'suspended')).toBe(false);
  });
});
