import { correctionPlaySource, playSourceKey } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { platformProblem, readState } from '../live-game.ts';
import { ownerId, scorekeeperId } from '../memory-games.test-helper.ts';
import {
  awayIds,
  gameId,
  homeIds,
  setUp,
  tap,
  versionOf,
  type Tracker,
} from '../reopen-game.test-helper.ts';
import { readTrackedBoxScore } from './read-tracked-box-score.ts';
import { reopenGame } from './reopen-game.ts';
import { takeBackTrackedBasket } from './take-back-tracked-basket.ts';

const [h0 = '', h1 = ''] = homeIds;
const [a0 = ''] = awayIds;

/** Home 3 (the wrong one) + 2, away 2, ended; then reopened with a reason when asked. */
async function ended(t: Tracker, reopen = true) {
  await tap(t, [
    { type: 'lineup', side: 'home', playerIds: homeIds },
    { type: 'lineup', side: 'away', playerIds: awayIds },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: h0, points: 3 },
    { type: 'foul', side: 'home', playerId: h0 },
    { type: 'score', side: 'home', playerId: h1, points: 2 },
    { type: 'score', side: 'away', playerId: a0, points: 2 },
  ]);
  t.clock.advance(1800);
  expect(await tap(t, [{ type: 'end' }])).toEqual(['accepted']);
  if (!reopen) return;
  const result = await reopenGame(
    t.as(ownerId),
    { gameId, version: versionOf(t), reason: 'The three was counted twice' },
    t.deps,
  );
  expect(result.ok).toBe(true);
}

const state = (t: Tracker) => {
  const saved = t.db.state.states.find((s) => s.gameId === gameId);
  if (saved === undefined) throw new Error('no state');
  return readState(saved.state);
};
const playIdOf = (t: Tracker, type: string) =>
  state(t).plays.find((p) => p.type === type)?.id ?? '';
async function sequenceOf(t: Tracker) {
  const read = await readTrackedBoxScore(t.as(ownerId), { gameId }, t.deps);
  if (!read.ok) throw new Error(`read refused: ${read.error.code}`);
  return read.value.sequence;
}
const takeBack = (t: Tracker, sequence: number, playId: string, accountId: string = ownerId) =>
  takeBackTrackedBasket(t.as(accountId), { gameId, sequence, playId }, t.deps);

describe('games.take_back_tracked_basket (step 2.247, T-433)', () => {
  it('writes one unscore, marked as a correction, and the score and the lines follow', async () => {
    const t = setUp();
    await ended(t);
    const sequence = await sequenceOf(t);
    const playId = playIdOf(t, 'score');
    expect(await takeBack(t, sequence, playId)).toEqual({
      ok: true,
      value: { sequence: sequence + 1 },
    });
    const added = t.db.state.events.filter((e) => e.seq > sequence);
    expect(added.map((e) => [e.type, e.payload, e.accountId])).toEqual([
      [
        'unscore',
        {
          side: 'home',
          playerId: h0,
          points: 3,
          playId,
          [playSourceKey]: correctionPlaySource,
        },
        ownerId,
      ],
    ]);
    const lines = t.db.state.liveLines;
    expect(lines.find((l) => l.personId === h0)?.stats.points ?? 0).toBe(0);
    expect(lines.find((l) => l.personId === h1)?.stats.points).toBe(2);
    expect(t.db.state.activity.at(-1)?.action).toBe('games.take_back_tracked_basket');
    // The engine refuses a second take-back of it, in its own words, and nothing is written.
    const events = t.db.state.events.length;
    expect(await takeBack(t, sequence + 1, playId)).toEqual({
      ok: false,
      error: { code: 'rule', problem: 'engine', message: 'That basket is already taken back.' },
    });
    expect(t.db.state.events.length).toBe(events);
  });

  it('refuses a play that is not a basket, one not in the game, and a stale read', async () => {
    const t = setUp();
    await ended(t);
    const sequence = await sequenceOf(t);
    const engine = (message: string) => ({
      ok: false,
      error: { code: 'rule', problem: 'engine', message },
    });
    expect(await takeBack(t, sequence, playIdOf(t, 'foul'))).toEqual(
      engine('That play is not a basket.'),
    );
    expect(await takeBack(t, sequence, 'of-another-game')).toEqual(
      engine('That basket is not in this game.'),
    );
    expect(await takeBack(t, sequence - 1, playIdOf(t, 'score'))).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
  });

  it('refuses a game not open to correction, and whoever may not correct games', async () => {
    const t = setUp();
    await ended(t, false);
    const events = t.db.state.events.length;
    expect(await takeBack(t, events, playIdOf(t, 'score'))).toEqual({
      ok: false,
      error: { code: 'game-final' },
    });
    const live = setUp();
    await tap(live, [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'score', side: 'home', playerId: h0, points: 2 },
    ]);
    expect(await takeBack(live, 2, playIdOf(live, 'score'))).toEqual({
      ok: false,
      error: { code: 'reason-needed' },
    });
    const open = setUp();
    await ended(open);
    expect(
      await takeBack(open, await sequenceOf(open), playIdOf(open, 'score'), scorekeeperId),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } });
  });

  it('a tap of the tracker cannot take a basket back: only a correction does', async () => {
    const t = setUp();
    await ended(t);
    const playId = playIdOf(t, 'score');
    const unscore = { type: 'unscore', side: 'home', playerId: h0, points: 3, playId } as const;
    // A tracker of the first protocol cannot even say it; the current one is refused it.
    await expect(tap(t, [unscore])).rejects.toThrow('batch refused: invalid-input');
    expect(platformProblem(unscore)).toBe(
      'A basket is taken back by correcting the game, not a tap.',
    );
    expect(platformProblem(unscore, correctionPlaySource)).toBeUndefined();
    expect(state(t).plays.some((p) => p.type === 'unscore')).toBe(false);
  });

  it('in an archived season: refused until reopened with a reason (O-12)', async () => {
    const t = setUp();
    await ended(t, false);
    t.db.state.seasons = t.db.state.seasons.map((x) => ({ ...x, status: 'completed' }));
    const events = t.db.state.events.length;
    expect(await takeBack(t, events, playIdOf(t, 'score'))).toEqual({
      ok: false,
      error: { code: 'season-archived' },
    });
    const reopen = await reopenGame(
      t.as(ownerId),
      { gameId, version: versionOf(t), reason: 'The three was counted twice' },
      t.deps,
    );
    expect(reopen.ok).toBe(true);
    const taken = await takeBack(t, await sequenceOf(t), playIdOf(t, 'score'));
    expect(taken.ok).toBe(true);
  });
});
