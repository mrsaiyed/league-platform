import { describe, expect, it } from 'vitest';
import { ownerId, scorekeeperId } from '../memory-games.test-helper.ts';
import {
  endedOnTablet,
  gameId,
  homeIds,
  sequenceOf,
  setUp,
  versionOf,
} from '../reopen-game.test-helper.ts';
import { readTrackedBoxScore } from './read-tracked-box-score.ts';
import { reopenGame } from './reopen-game.ts';

describe('games.read_tracked_box_score (step 2.65)', () => {
  it('gives the lines from the plays, the last event, and whether the grid may be saved', async () => {
    const t = setUp();
    expect(await readTrackedBoxScore(t.as(ownerId), { gameId }, t.deps)).toEqual({
      ok: false,
      error: { code: 'not-tracked' },
    });
    await endedOnTablet(t);
    const final = await readTrackedBoxScore(t.as(ownerId), { gameId }, t.deps);
    expect(final.ok && final.value).toMatchObject({
      correctable: false,
      notCorrectable: 'game-final',
      sequence: sequenceOf(t),
    });
    await reopenGame(t.as(ownerId), { gameId, version: versionOf(t), reason: 'A foul' }, t.deps);
    const read = await readTrackedBoxScore(t.as(ownerId), { gameId }, t.deps);
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value.correctable).toBe(true);
    expect(read.value.notCorrectable).toBeUndefined();
    expect(read.value.sequence).toBe(sequenceOf(t));
    expect(read.value.lines.find((l) => l.personId === homeIds[0])).toMatchObject({
      points: 3,
      fg3: 1,
      fg2: 0,
      fouls: 0,
      jerseyNumber: '10',
    });
    // Everyone of the game's day is a row: ten players, all in the line-ups.
    expect(read.value.lines).toHaveLength(10);
  });

  it('is for whoever may correct games only', async () => {
    const t = setUp();
    await endedOnTablet(t);
    expect(await readTrackedBoxScore(t.as(scorekeeperId), { gameId }, t.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});
