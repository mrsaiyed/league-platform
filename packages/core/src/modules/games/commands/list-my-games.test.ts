import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  editorGrant,
  editorId,
  game,
  gameUuid,
  memoryGames,
  otherSeasonId,
  ownerId,
  programScorekeeperGrant,
  programScorekeeperId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  type MemoryGames,
} from '../memory-games.test-helper.ts';
import { listMyGames } from './list-my-games.ts';

// The league's today is 6 December (the stand-in keeps UTC).
const games = [
  game(1, { startsAt: '2026-12-06T18:00:00.000Z' }),
  game(2, { startsAt: '2026-12-12T23:30:00.000Z', status: 'postponed' }),
  // The day after the week, the day before today, in the bin, with no date.
  game(3, { startsAt: '2026-12-13T00:30:00.000Z' }),
  game(4, { startsAt: '2026-12-05T18:00:00.000Z' }),
  game(5, { startsAt: '2026-12-07T18:00:00.000Z', binned: true }),
  game(6, { startsAt: null }),
  // Of the other season's program.
  game(7, { startsAt: '2026-12-08T18:00:00.000Z', seasonId: otherSeasonId }),
  // Won in the first overtime (step 2.200).
  game(8, {
    startsAt: '2026-12-06T12:00:00.000Z',
    status: 'final',
    homeScore: 52,
    awayScore: 50,
    overtimePeriods: 1,
  }),
];
const grants = [scorekeeperGrant, schedulerGrant, editorGrant, programScorekeeperGrant];

async function listed(account: string, state: Partial<MemoryGames> = {}) {
  const { deps, as } = memoryGames({ games, grants, ...state });
  const result = await listMyGames(as(account), {}, deps);
  if (!result.ok) return result.error.code;
  return result.value.games.map((g) => `${g.id.slice(-1)}${g.assignedToMe ? '*' : ''}`);
}

describe('listMyGames', () => {
  it('lists today and the six days after, soonest first, with what the list needs', async () => {
    const { deps, as } = memoryGames({
      games,
      grants,
      assignments: [{ gameId: gameUuid(1), accountId: scorekeeperId }],
    });
    const result = await listMyGames(as(scorekeeperId), {}, deps);
    expect(result.ok && result.value.today).toBe('2026-12-06');
    expect(result.ok && result.value.games.map((g) => g.id)).toEqual([
      gameUuid(8),
      gameUuid(1),
      gameUuid(7),
      gameUuid(2),
    ]);
    expect(result.ok && result.value.games[1]).toEqual({
      id: gameUuid(1),
      seasonId: games[0]?.seasonId,
      programId: expect.any(String),
      divisionId: null,
      homeTeamId: games[0]?.homeTeamId,
      awayTeamId: games[0]?.awayTeamId,
      startsAt: '2026-12-06T18:00:00.000Z',
      day: '2026-12-06',
      isToday: true,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      overtimePeriods: null,
      recording: 'final-score',
      assignedToMe: true,
      scorable: true,
      hasPlays: false,
      version: 1,
      // The starting rules' forfeit score (step 2.158: the forfeit's question says it).
      forfeitScore: { winner: 20, loser: 0 },
    });
    // The final game keeps its overtime periods for its card (step 2.200).
    expect(result.ok && result.value.games[0]).toMatchObject({
      status: 'final',
      overtimePeriods: 1,
    });
    expect(result.ok && result.value.games[3]).toMatchObject({
      day: '2026-12-12',
      isToday: false,
      status: 'postponed',
      assignedToMe: false,
    });
  });

  it('says which games still to be decided the live tracker has recorded plays of (S-46)', async () => {
    const { deps, as } = memoryGames({
      games,
      grants,
      // Game 1 is to be played and has plays; game 8 is final; game 2 is postponed.
      tracked: [gameUuid(1), gameUuid(8), gameUuid(2)],
    });
    const result = await listMyGames(as(ownerId), {}, deps);
    expect(result.ok && result.value.games.map((g) => [g.id.slice(-1), g.hasPlays])).toEqual([
      ['8', false],
      ['1', true],
      ['7', false],
      ['2', false],
    ]);
  });

  it('keeps a game under way however long ago it started, before the midnight too (step 2.156)', async () => {
    // Started at 11:30 PM yesterday and still being played at noon today; and yesterday's
    // game that was never started stays off this list (it is under "Needs a result").
    const live = game(9, { startsAt: '2026-12-05T23:30:00.000Z', status: 'live' });
    expect(await listed(scorekeeperId, { games: [...games, live] })).toEqual([
      '9',
      '8',
      '1',
      '7',
      '2',
    ]);
    const { deps, as } = memoryGames({ games: [live], grants });
    const result = await listMyGames(as(scorekeeperId), {}, deps);
    expect(result.ok && result.value.games[0]).toMatchObject({ day: '2026-12-05', isToday: false });
  });

  it('shows a scorekeeper every game in reach while any scorekeeper may score', async () => {
    const assignments = [{ gameId: gameUuid(2), accountId: scorekeeperId }];
    expect(await listed(scorekeeperId, { assignments })).toEqual(['8', '1', '7', '2*']);
    expect(
      await listed(scorekeeperId, { assignments, settings: scoringRule('anyScorekeeper') }),
    ).toEqual(['8', '1', '7', '2*']);
  });

  it('shows a scorekeeper only their assigned games when only those may be scored', async () => {
    const assignments = [
      { gameId: gameUuid(2), accountId: scorekeeperId },
      // Another scorekeeper's game, and the scorekeeper's game outside the week.
      { gameId: gameUuid(1), accountId: programScorekeeperId },
      { gameId: gameUuid(3), accountId: scorekeeperId },
    ];
    const settings = scoringRule('assignedOnly');
    expect(await listed(scorekeeperId, { assignments, settings })).toEqual(['2*']);
    // Owners and schedulers still see every game they may score.
    expect(await listed(ownerId, { assignments, settings })).toEqual(['8', '1', '7', '2']);
    expect(await listed(schedulerId, { assignments, settings })).toEqual(['8', '1', '7', '2']);
  });

  it("keeps a program's scorekeeper to that program, assigned or not", async () => {
    const assignments = [{ gameId: gameUuid(1), accountId: programScorekeeperId }];
    expect(await listed(programScorekeeperId, { assignments })).toEqual(['7']);
    expect(
      await listed(programScorekeeperId, { assignments, settings: scoringRule('assignedOnly') }),
    ).toEqual([]);
  });

  it('still lists the games in an archived or suspended league, marked not scorable', async () => {
    for (const status of ['archived', 'suspended']) {
      const { deps, as } = memoryGames({ games, grants, status });
      const result = await listMyGames(as(scorekeeperId), {}, deps);
      expect(result.ok && result.value.games.map((g) => [g.id.slice(-1), g.scorable])).toEqual([
        ['8', false],
        ['1', false],
        ['7', false],
        ['2', false],
      ]);
    }
  });

  it("marks an archived season's games not scorable, but while a correction is open for those who may correct games (T-389)", async () => {
    const reopened = {
      gameId: gameUuid(1),
      accountId: ownerId,
      reason: 'The score was wrong',
      before: { version: 1, status: 'final', homeScore: 50, awayScore: 48 },
      after: { version: 1, status: 'scheduled', homeScore: null, awayScore: null },
    } as const;
    const { deps, as, db } = memoryGames({ games, grants, corrections: [reopened] });
    db.state.seasons = db.state.seasons.map((x) =>
      x.id === otherSeasonId ? x : { ...x, status: 'completed' },
    );
    const scorable = async (account: string) => {
      const result = await listMyGames(as(account), {}, deps);
      return result.ok && result.value.games.map((g) => [g.id.slice(-1), g.scorable]);
    };
    expect(await scorable(scorekeeperId)).toEqual([
      ['8', false],
      ['1', false],
      ['7', true],
      ['2', false],
    ]);
    expect(await scorable(ownerId)).toEqual([
      ['8', false],
      ['1', true],
      ['7', true],
      ['2', false],
    ]);
  });

  it('refuses anyone who scores nowhere, a removed scorekeeper at once, and a visitor', async () => {
    expect(await listed(editorId)).toBe('not-allowed');
    const revoked: Grant = { ...scorekeeperGrant, revokedAt: '2026-12-06T17:00:00.000Z' };
    const assignments = [{ gameId: gameUuid(1), accountId: scorekeeperId }];
    expect(await listed(scorekeeperId, { grants: [revoked], assignments })).toBe('not-allowed');
    const { deps, as } = memoryGames({ games });
    expect(await listMyGames(as(null), {}, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});
