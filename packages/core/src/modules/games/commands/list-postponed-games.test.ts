import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  game,
  gameUuid,
  memoryGames,
  otherSeasonId,
  ownerId,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from '../memory-games.test-helper.ts';
import { listPostponedGames } from './list-postponed-games.ts';

describe('listPostponedGames', () => {
  const games = [
    game(1, { status: 'postponed', startsAt: '2026-12-20T18:00:00.000Z' }),
    game(2, { status: 'postponed', startsAt: '2026-12-13T18:00:00.000Z' }),
    game(3, { status: 'postponed', binned: true }),
    game(4),
    game(5, { status: 'postponed', seasonId: otherSeasonId, startsAt: null }),
  ];

  it('lists only postponed games not in the bin, soonest first, with the recording spelled as in rules', async () => {
    const { deps, as } = memoryGames({ games });
    const result = await listPostponedGames(as(ownerId), {}, deps);
    expect(result.ok && result.value.map((g) => g.id)).toEqual([
      gameUuid(2),
      gameUuid(1),
      gameUuid(5),
    ]);
    expect(result.ok && result.value[0]?.recording).toBe('final-score');
  });

  it('can be limited to one season', async () => {
    const { deps, as } = memoryGames({ games });
    const result = await listPostponedGames(as(ownerId), { seasonId: otherSeasonId }, deps);
    expect(result.ok && result.value.map((g) => g.id)).toEqual([gameUuid(5)]);
  });

  it('needs schedule.read: a scheduler may; a scorekeeper (T-472) and an editor may not', async () => {
    const { deps, as } = memoryGames({
      games,
      grants: [schedulerGrant, scorekeeperGrant, editorGrant],
    });
    expect(await listPostponedGames(as(schedulerId), {}, deps)).toMatchObject({ ok: true });
    for (const refused of [scorekeeperId, editorId]) {
      expect(await listPostponedGames(as(refused), {}, deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
  });

  // T-473: by what the holder may see, the season's program.
  it("gives someone limited to one program only that program's postponed games", async () => {
    const programScheduler = {
      ...schedulerGrant,
      id: '01900000-0000-7000-8000-0000000000f9',
      scope: { type: 'program', id: 'p1' },
    } as const;
    const { deps, as } = memoryGames({ games, grants: [programScheduler, programAdminGrant] });
    // The scheduler of p1 (the first season's program) gets the first season's two.
    const p1 = await listPostponedGames(as(schedulerId), {}, deps);
    expect(p1.ok && p1.value.map((g) => g.id)).toEqual([gameUuid(2), gameUuid(1)]);
    // An admin of p2 gets only the other season's, even when asking for the first season.
    const p2 = await listPostponedGames(as(programAdminId), {}, deps);
    expect(p2.ok && p2.value.map((g) => g.id)).toEqual([gameUuid(5)]);
    const asked = await listPostponedGames(as(programAdminId), { seasonId }, deps);
    expect(asked.ok && asked.value).toEqual([]);
  });

  it('gives the owner and a league-wide scheduler every one, as before', async () => {
    const { deps, as } = memoryGames({ games, grants: [schedulerGrant] });
    for (const who of [ownerId, schedulerId]) {
      const result = await listPostponedGames(as(who), {}, deps);
      expect(result.ok && result.value.length).toBe(3);
    }
  });
});
