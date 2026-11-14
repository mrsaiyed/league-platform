import { describe, expect, it } from 'vitest';
import { grantOf, memoryBin, ownerId, teamId } from '../memory-bin.test-helper.ts';
import { restoreGame } from './restore-game.ts';

const binnedAt = '2026-01-01T00:00:00.000Z';
const id = teamId(7);

describe('restoreGame', () => {
  it('brings back a game a publish removed', async () => {
    const { db, deps, as } = memoryBin({
      things: [{ id, kind: 'game', name: 'A v B', binnedAt, status: 'scheduled' }],
    });
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toMatchObject({ ok: true });
    expect(db.state.things[0]?.binnedAt).toBeNull();
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.restore_game']);
  });

  it('never restores a played game: it is corrected, not restored', async () => {
    const { deps, as } = memoryBin({
      things: [{ id, kind: 'game', name: 'A v B', binnedAt, status: 'final' }],
    });
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toMatchObject({
      error: { code: 'game-not-restorable' },
    });
  });

  it('keeps a game in the bin while a part of it is, or its number was taken', async () => {
    const part = memoryBin({
      things: [{ id, kind: 'game', name: 'A v B', binnedAt, partInBin: true }],
    });
    expect(await restoreGame(part.as(ownerId), { gameId: id }, part.deps)).toMatchObject({
      error: { code: 'game-part-in-bin' },
    });
    const taken = memoryBin({
      things: [{ id, kind: 'game', name: 'A v B', binnedAt, clash: 'game-number-taken' }],
    });
    expect(await restoreGame(taken.as(ownerId), { gameId: id }, taken.deps)).toMatchObject({
      error: { code: 'game-number-taken' },
    });
  });

  it('refuses a missing game and non-admins', async () => {
    const { deps, as } = memoryBin();
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toMatchObject({
      error: { code: 'game-not-found' },
    });
    expect(await restoreGame(as('someone'), { gameId: id }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('lets a scheduler restore, as their publish removed it (A-5), but not a registrar', async () => {
    const { deps, as } = memoryBin({
      things: [{ id, kind: 'game', name: 'A v B', binnedAt, status: 'scheduled' }],
      grants: [grantOf('reg', 'registrar'), grantOf('sch', 'scheduler')],
    });
    expect(await restoreGame(as('reg'), { gameId: id }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await restoreGame(as('sch'), { gameId: id }, deps)).toMatchObject({ ok: true });
  });
});
