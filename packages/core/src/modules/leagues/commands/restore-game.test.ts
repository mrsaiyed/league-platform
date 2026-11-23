import { describe, expect, it } from 'vitest';
import {
  grantOf,
  memoryBin,
  otherSeasonId,
  ownerId,
  seasonId,
  teamId,
} from '../memory-bin.test-helper.ts';
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

  it('is a schedule change (A-19): a revision, the people it reaches, its clashes', async () => {
    const { db, deps, as } = memoryBin({
      things: [
        { id, kind: 'game', name: 'A v B', binnedAt, status: 'scheduled', clashesWith: ['g2'] },
      ],
      revisions: [{ number: 3, summary: {} }],
      people: { home: 9, away: 11 },
    });
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toEqual({
      ok: true,
      value: {
        gameId: id,
        seasonId,
        revision: 4,
        teamCount: 2,
        peopleCount: 20,
        clashes: [{ id: 'g2' }],
      },
    });
    expect(db.state.revisions.at(-1)).toMatchObject({
      number: 4,
      summary: { basedOnRevision: 3, gamesAdded: 1, restoredFromBin: [id], peopleAffected: 20 },
    });
    expect(db.state.activity[0]?.details).toEqual({
      revision: 4,
      teamsAffected: 2,
      peopleAffected: 20,
      clashes: 1,
    });
  });

  it('says no clash for a postponed game, and writes nothing for one already back', async () => {
    const { db, deps, as } = memoryBin({
      things: [
        { id, kind: 'game', name: 'A v B', binnedAt, status: 'postponed', clashesWith: ['g2'] },
      ],
    });
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toMatchObject({
      value: { revision: 1, clashes: [] },
    });
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toMatchObject({
      value: { revision: null },
    });
    expect(db.state.revisions).toHaveLength(1);
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

  it('rolls back when the revision number was taken meanwhile: the game stays in the bin', async () => {
    // The newest revision read is 2 while a publish at the same moment wrote 3.
    const { db, deps, as } = memoryBin({
      things: [{ id, kind: 'game', name: 'A v B', binnedAt, status: 'scheduled' }],
      revisions: [
        { number: 3, summary: {} },
        { number: 2, summary: {} },
      ],
    });
    expect(await restoreGame(as(ownerId), { gameId: id }, deps)).toEqual({
      ok: false,
      error: { code: 'revision-out-of-date' },
    });
    expect(db.state.things[0]?.binnedAt).toBe(binnedAt);
    expect(db.state.revisions).toHaveLength(2);
    expect(db.state.activity).toEqual([]);
  });

  it("refuses a scheduler of one program another program's game, and lets them their own", async () => {
    const other = teamId(8);
    const { db, deps, as } = memoryBin({
      things: [
        { id, kind: 'game', name: 'A v B', binnedAt, status: 'scheduled' },
        {
          id: other,
          kind: 'game',
          name: 'C v D',
          binnedAt,
          status: 'scheduled',
          season: otherSeasonId,
        },
      ],
      grants: [grantOf('sch', 'scheduler', 'p1')],
    });
    expect(await restoreGame(as('sch'), { gameId: other }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.things[1]?.binnedAt).toBe(binnedAt);
    expect(await restoreGame(as('sch'), { gameId: id }, deps)).toMatchObject({ ok: true });
  });
});
