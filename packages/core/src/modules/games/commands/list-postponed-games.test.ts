import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  game,
  gameUuid,
  memoryGames,
  otherSeasonId,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
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

  it('needs schedule.read: a scorekeeper may, an editor may not', async () => {
    const { deps, as } = memoryGames({ games, grants: [scorekeeperGrant, editorGrant] });
    expect(await listPostponedGames(as(scorekeeperId), {}, deps)).toMatchObject({ ok: true });
    expect(await listPostponedGames(as(editorId), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
