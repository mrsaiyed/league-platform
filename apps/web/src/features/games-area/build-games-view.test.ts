import type { AccessHolder, MyGame } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { buildGameRows } from './build-games-view.ts';

const owner: AccessHolder = { accountId: 'owner', isOwner: true, grants: [] };

const game = (over: Partial<MyGame>): MyGame => ({
  id: '01900000-0000-7000-8000-000000000001',
  seasonId: '01900000-0000-7000-8000-0000000000a1',
  programId: '01900000-0000-7000-8000-0000000000b1',
  divisionId: null,
  homeTeamId: '01900000-0000-7000-8000-0000000000c1',
  awayTeamId: '01900000-0000-7000-8000-0000000000c2',
  startsAt: '2026-12-06T18:00:00.000Z',
  day: '2026-12-06',
  isToday: true,
  status: 'scheduled',
  homeScore: null,
  awayScore: null,
  overtimePeriods: null,
  recording: 'final-score',
  assignedToMe: false,
  scorable: true,
  inArchivedSeason: false,
  hasPlays: false,
  version: 2,
  forfeitScore: { winner: 20, loser: 0 },
  ...over,
});

const rowOf = (over: Partial<MyGame>) => {
  const [row] = buildGameRows([game(over)], { teams: {}, scorekeepers: {} }, owner);
  if (row === undefined) throw new Error('no row');
  return row;
};

describe('buildGameRows', () => {
  it('offers the owner postpone and cancel on a game still to be played', () => {
    expect(rowOf({})).toMatchObject({ canScore: true, canPostpone: true, canCancel: true });
    expect(rowOf({ status: 'postponed' })).toMatchObject({ canCancel: true, canRestore: true });
  });

  it('offers no postpone, cancel or put back on a game reopened by a correction in an archived season, only its result (O-12, T-390)', () => {
    // Scorable: the owner's correction is open on it (T-389).
    expect(rowOf({ inArchivedSeason: true })).toMatchObject({
      canScore: true,
      canForfeit: true,
      canPostpone: false,
      canCancel: false,
    });
    expect(rowOf({ inArchivedSeason: true, status: 'postponed' })).toMatchObject({
      canCancel: false,
      canRestore: false,
    });
    expect(rowOf({ inArchivedSeason: true, status: 'cancelled' })).toMatchObject({
      canPutBack: false,
    });
  });
});
