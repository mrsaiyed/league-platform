import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  finalGame,
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
import { listGamesNeedingResult, needsResultLimit } from './list-games-needing-result.ts';

// The league's today is 6 December, and it is noon (the stand-in keeps UTC).
const games = [
  // Three days ago, never scored: the one the owner is looking for.
  game(1, { startsAt: '2026-12-03T18:00:00.000Z' }),
  // Under way since before midnight; and this morning's, not entered.
  game(2, { startsAt: '2026-12-05T23:30:00.000Z', status: 'live' }),
  game(3, { startsAt: '2026-12-06T09:00:00.000Z' }),
  // Still to come today; with no time; decided, called off, in the bin.
  game(4, { startsAt: '2026-12-06T18:00:00.000Z' }),
  game(5, { startsAt: null }),
  finalGame(6, { startsAt: '2026-12-02T18:00:00.000Z' }),
  game(7, { startsAt: '2026-12-02T18:00:00.000Z', status: 'forfeit' }),
  game(8, { startsAt: '2026-12-02T18:00:00.000Z', status: 'postponed' }),
  game(9, { startsAt: '2026-12-02T18:00:00.000Z', status: 'cancelled' }),
  game(10, { startsAt: '2026-11-01T18:00:00.000Z', binned: true }),
  // A month ago, of the other season's program.
  game(11, { startsAt: '2026-11-06T18:00:00.000Z', seasonId: otherSeasonId }),
];
const grants = [scorekeeperGrant, schedulerGrant, editorGrant, programScorekeeperGrant];

async function listed(account: string, state: Partial<MemoryGames> = {}) {
  const { deps, as } = memoryGames({ games, grants, ...state });
  const result = await listGamesNeedingResult(as(account), {}, deps);
  if (!result.ok) return result.error.code;
  return result.value.games.map((g) => `${Number(g.id.slice(-4))}${g.assignedToMe ? '*' : ''}`);
}

describe('listGamesNeedingResult', () => {
  it('lists every game past its start with no result, oldest first, whenever it was', async () => {
    const { deps, as } = memoryGames({ games, grants });
    const result = await listGamesNeedingResult(as(ownerId), {}, deps);
    expect(result.ok && result.value.today).toBe('2026-12-06');
    expect(result.ok && result.value.more).toBe(false);
    expect(result.ok && result.value.games.map((g) => g.id)).toEqual([11, 1, 2, 3].map(gameUuid));
    expect(result.ok && result.value.games[1]).toMatchObject({
      day: '2026-12-03',
      isToday: false,
      status: 'scheduled',
      recording: 'final-score',
      scorable: true,
    });
  });

  it('shows a scorekeeper only the games they may score', async () => {
    const assignments = [{ gameId: gameUuid(1), accountId: scorekeeperId }];
    expect(await listed(scorekeeperId, { assignments })).toEqual(['11', '1*', '2', '3']);
    const settings = scoringRule('assignedOnly');
    expect(await listed(scorekeeperId, { assignments, settings })).toEqual(['1*']);
    expect(await listed(schedulerId, { assignments, settings })).toEqual(['11', '1', '2', '3']);
    expect(await listed(programScorekeeperId)).toEqual(['11']);
  });

  it('holds at most its limit, the oldest, and says there are more', async () => {
    const many = Array.from({ length: needsResultLimit + 5 }, (_, i) =>
      game(100 + i, {
        startsAt: new Date(Date.UTC(2026, 10, 1, 18) + i * 3_600_000).toISOString(),
      }),
    );
    const { deps, as } = memoryGames({ games: many, grants });
    const result = await listGamesNeedingResult(as(ownerId), {}, deps);
    expect(result.ok && result.value.games.length).toBe(needsResultLimit);
    expect(result.ok && result.value.games[0]?.id).toBe(gameUuid(100));
    expect(result.ok && result.value.more).toBe(true);
    // A scorekeeper who scores only some of them is not told of the others.
    const settings = scoringRule('assignedOnly');
    const assignments = [{ gameId: gameUuid(100), accountId: scorekeeperId }];
    const theirs = memoryGames({ games: many, grants, settings, assignments });
    const mine = await listGamesNeedingResult(theirs.as(scorekeeperId), {}, theirs.deps);
    expect(mine.ok && mine.value).toMatchObject({ more: false, games: [{ id: gameUuid(100) }] });
  });

  // The review's H1: the cut is made after the person's own filter, never before it.
  describe('a person who scores only some games, past the limit of games they do not score', () => {
    const hours = (i: number) => new Date(Date.UTC(2026, 10, 1, 8) + i * 3_600_000).toISOString();
    const old = Array.from({ length: needsResultLimit + 1 }, (_, i) =>
      game(100 + i, { startsAt: hours(i) }),
    );

    it("still sees a program scorekeeper's own game, and only it", async () => {
      const theirs = game(900, { startsAt: '2026-12-05T18:00:00.000Z', seasonId: otherSeasonId });
      const { deps, as } = memoryGames({ games: [...old, theirs], grants });
      const mine = await listGamesNeedingResult(as(programScorekeeperId), {}, deps);
      expect(mine.ok && mine.value).toMatchObject({ more: false, games: [{ id: gameUuid(900) }] });
      expect(mine.ok && mine.value.games).toHaveLength(1);
      const owner = await listGamesNeedingResult(as(ownerId), {}, deps);
      expect(owner.ok && owner.value.more).toBe(true);
    });

    it('still sees the one assigned game of a scorekeeper who scores assigned games only', async () => {
      const assignments = [{ gameId: gameUuid(100 + needsResultLimit), accountId: scorekeeperId }];
      const settings = scoringRule('assignedOnly');
      const { deps, as } = memoryGames({ games: old, grants, assignments, settings });
      const mine = await listGamesNeedingResult(as(scorekeeperId), {}, deps);
      expect(mine.ok && mine.value).toMatchObject({
        more: false,
        games: [{ id: gameUuid(100 + needsResultLimit), assignedToMe: true }],
      });
      expect(mine.ok && mine.value.games).toHaveLength(1);
    });

    it('says "more" to them only when games they score were cut', async () => {
      const theirs = Array.from({ length: needsResultLimit + 1 }, (_, i) =>
        game(300 + i, { startsAt: hours(200 + i), seasonId: otherSeasonId }),
      );
      const { deps, as } = memoryGames({ games: [...old, ...theirs], grants });
      const mine = await listGamesNeedingResult(as(programScorekeeperId), {}, deps);
      expect(mine.ok && mine.value.games).toHaveLength(needsResultLimit);
      expect(mine.ok && mine.value.games[0]?.id).toBe(gameUuid(300));
      expect(mine.ok && mine.value.more).toBe(true);
    });
  });

  it('still lists them in an archived league, marked not scorable', async () => {
    const { deps, as } = memoryGames({ games, grants, status: 'archived' });
    const result = await listGamesNeedingResult(as(ownerId), {}, deps);
    expect(result.ok && result.value.games.every((g) => !g.scorable)).toBe(true);
  });

  it('refuses anyone who scores nowhere, and a visitor', async () => {
    expect(await listed(editorId)).toBe('not-allowed');
    const { deps, as } = memoryGames({ games });
    expect(await listGamesNeedingResult(as(null), {}, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});
