// What the scorekeeper's device is told before the Reopen tap (step 2.120, S-36):
// games.read_reopen_offer answers always, until a server time, or not with the reason,
// and who ended the game, by the same rule the reopen follows (reopen-window.ts).
import { describe, expect, it } from 'vitest';
import {
  finalGame,
  game,
  gameUuid,
  ownerId,
  programScorekeeperId,
  schedulerId,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import {
  endedOnTablet,
  gameId,
  minutes,
  minutesSetting,
  offerTo,
  otherScorekeeperId,
  setUp,
} from '../reopen-game.test-helper.ts';
import { readReopenOffer } from './read-reopen-offer.ts';

describe('what the device is told before the tap (games.read_reopen_offer)', () => {
  it('offers it until a server time to the one who ended it, always to a corrector, and says who ended it', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(10);
    expect(await offerTo(t, scorekeeperId)).toEqual({
      reopen: { when: 'until', until: endedAt + minutes(30) },
      endedBy: scorekeeperId,
    });
    expect(await offerTo(t, schedulerId)).toEqual({
      reopen: { when: 'always' },
      endedBy: scorekeeperId,
    });
    expect(await offerTo(t, otherScorekeeperId)).toEqual({
      reopen: { when: 'no', code: 'not-ended-by-you' },
      endedBy: scorekeeperId,
    });
    t.clock.at = endedAt + minutes(31);
    expect((await offerTo(t, scorekeeperId)).reopen).toEqual({
      when: 'no',
      code: 'reopen-time-over',
    });
    // The read changes nothing.
    expect(t.db.state.corrections).toEqual([]);
  });

  it('answers "no" to whoever could reopen it while an overturn rules on the result (S-85)', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(10);
    t.db.state.games = t.db.state.games.map((g) =>
      g.id === gameId ? { ...g, overturned: true } : g,
    );
    for (const who of [scorekeeperId, schedulerId]) {
      expect((await offerTo(t, who)).reopen).toEqual({ when: 'no', code: 'result-overturned' });
    }
    expect((await offerTo(t, otherScorekeeperId)).reopen).toEqual({
      when: 'no',
      code: 'not-ended-by-you',
    });
  });

  it('answers "no" with the reason for every game it would refuse, and refuses whoever may not score it', async () => {
    const t = setUp({
      games: [game(1, { captureMode: 'live' }), finalGame(2)],
      settings: minutesSetting(0),
    });
    expect((await offerTo(t, scorekeeperId)).reopen).toEqual({
      when: 'no',
      code: 'game-not-decided',
    });
    const byHand = await readReopenOffer(t.as(scorekeeperId), { gameId: gameUuid(2) }, t.deps);
    expect(byHand).toMatchObject({
      ok: true,
      value: { reopen: { when: 'no', code: 'not-ended-by-tracker' }, endedBy: null },
    });
    await endedOnTablet(t);
    expect((await offerTo(t, scorekeeperId)).reopen).toEqual({
      when: 'no',
      code: 'scorekeepers-may-not-reopen',
    });
    const stranger = await readReopenOffer(t.as(programScorekeeperId), { gameId }, t.deps);
    expect(stranger).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    const missing = await readReopenOffer(t.as(ownerId), { gameId: gameUuid(9) }, t.deps);
    expect(missing).toMatchObject({ ok: false, error: { code: 'game-not-found' } });
  });
});
