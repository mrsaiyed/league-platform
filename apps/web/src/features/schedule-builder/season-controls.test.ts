// Role test (step 2.160, second review's Medium): the grid's edit and publish controls are
// checked at the season's own program, as the commands check them. A scheduler limited to
// program A gets them on A's season and none on B's; a league-wide one gets them on both.
import type { AccessHolder, Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { seasonControls } from './season-controls.ts';

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

const seasonOfA = { programId: programA, archived: false };
const publicSeasonOfB = { programId: programB, archived: false };
const all = { canEdit: true, canPublish: true };
const none = { canEdit: false, canPublish: false };

describe("the grid's controls, at the season's program (P4 §3)", () => {
  it("gives a scheduler at program A the controls on A's season, none on B's", () => {
    const oneProgram = holder([grant('scheduler', { type: 'program', id: programA })]);
    expect(seasonControls(oneProgram, seasonOfA)).toEqual(all);
    expect(seasonControls(oneProgram, publicSeasonOfB)).toEqual(none);
  });

  it('gives a league-wide scheduler and the owner the controls on every season', () => {
    const leagueWide = holder([grant('scheduler', { type: 'league' })]);
    expect(seasonControls(leagueWide, seasonOfA)).toEqual(all);
    expect(seasonControls(leagueWide, publicSeasonOfB)).toEqual(all);
    expect(seasonControls(holder([], true), publicSeasonOfB)).toEqual(all);
  });

  it('gives a scorekeeper, someone with no role, or nobody, none', () => {
    expect(seasonControls(holder([grant('scorekeeper', { type: 'league' })]), seasonOfA)).toEqual(
      none,
    );
    expect(seasonControls(holder([]), seasonOfA)).toEqual(none);
    expect(seasonControls(undefined, seasonOfA)).toEqual(none);
  });

  it('gives no one the controls in an archived season, the owner included (O-12)', () => {
    const archived = { programId: programA, archived: true };
    expect(seasonControls(holder([], true), archived)).toEqual(none);
    expect(seasonControls(holder([grant('scheduler', { type: 'league' })]), archived)).toEqual(
      none,
    );
  });
});
