import { describe, expect, it } from 'vitest';
import {
  finalGame,
  game,
  gameUuid,
  scorekeeperId,
  scoringRule,
} from '../memory-games.test-helper.ts';
import { startOfTest } from '../memory-scoring.test-helper.ts';
import { endedOnTablet, otherScorekeeperId, setUp } from '../reopen-game.test-helper.ts';
import { readOwnResultOffer } from './read-own-result-offer.ts';
import { readOwnResultOffers } from './read-own-result-offers.ts';

const minuteMs = 60_000;
const at = (minutesAgo: number) => new Date(startOfTest - minutesAgo * minuteMs).toISOString();

/** A list: mine 5 minutes ago, mine 40 minutes ago, another's, one not decided. */
function list() {
  return setUp({
    games: [
      finalGame(1, { finalizedAt: at(5) }),
      finalGame(2, { finalizedAt: at(40) }),
      finalGame(3, { finalizedAt: at(5), status: 'forfeit' }),
      game(4),
    ],
    deciders: {
      [gameUuid(1)]: scorekeeperId,
      [gameUuid(2)]: scorekeeperId,
      [gameUuid(3)]: otherScorekeeperId,
    },
    sessions: [],
  });
}

const ids = [1, 2, 3, 4].map(gameUuid);

describe('readOwnResultOffers (step 2.177, T-349)', () => {
  it('answers a whole list in one read of the games, as the read for one game does', async () => {
    const t = list();
    const result = await readOwnResultOffers(t.as(scorekeeperId), { gameIds: ids }, t.deps);
    expect(t.db.state.handResultReads).toBe(1);
    expect(result).toEqual({
      ok: true,
      value: [
        { gameId: ids[0], reopen: { when: 'until', until: startOfTest + 25 * minuteMs } },
        { gameId: ids[1], reopen: { when: 'no', code: 'reopen-time-over' } },
        { gameId: ids[2], reopen: { when: 'no', code: 'not-recorded-by-you' } },
        { gameId: ids[3], reopen: { when: 'no', code: 'game-not-decided' } },
      ],
    });
    // The same answers as the one-game read gives, game by game.
    for (const entry of result.ok ? result.value : []) {
      const one = await readOwnResultOffer(t.as(scorekeeperId), { gameId: entry.gameId }, t.deps);
      expect(one).toMatchObject({ ok: true, value: { reopen: entry.reopen } });
    }
    expect(t.db.state.handResultReads).toBe(1);
  });

  it('reads nothing for an empty list and leaves out games that are not there', async () => {
    const t = list();
    expect(await readOwnResultOffers(t.as(scorekeeperId), { gameIds: [] }, t.deps)).toEqual({
      ok: true,
      value: [],
    });
    expect(t.db.state.handResultReads).toBe(0);
    const missing = await readOwnResultOffers(
      t.as(scorekeeperId),
      { gameIds: [gameUuid(9)] },
      t.deps,
    );
    expect(missing).toEqual({ ok: true, value: [] });
  });

  it('sends a game its tracker ended to the tracker’s door', async () => {
    const t = setUp();
    await endedOnTablet(t);
    expect(
      await readOwnResultOffers(t.as(scorekeeperId), { gameIds: [gameUuid(1)] }, t.deps),
    ).toEqual({
      ok: true,
      value: [{ gameId: gameUuid(1), reopen: { when: 'no', code: 'not-recorded-by-hand' } }],
    });
  });

  it('offers no time for a game they may no longer score, as the read for one game', async () => {
    // Only assigned scorekeepers score, and they were unassigned after typing game 1.
    const t = setUp({
      ...list().db.state,
      settings: scoringRule('assignedOnly'),
      assignments: [{ gameId: gameUuid(2), accountId: scorekeeperId }],
    });
    const result = await readOwnResultOffers(t.as(scorekeeperId), { gameIds: ids }, t.deps);
    expect(result.ok && result.value.map((w) => w.gameId)).toEqual(ids.slice(1));
    const one = await readOwnResultOffer(t.as(scorekeeperId), { gameId: ids[0] ?? '' }, t.deps);
    expect(one.ok).toBe(false);
  });

  it('leaves out a game in the bin', async () => {
    const t = setUp({
      games: [
        finalGame(1, { finalizedAt: at(5), binned: true }),
        finalGame(2, { finalizedAt: at(5) }),
      ],
      deciders: { [gameUuid(1)]: scorekeeperId, [gameUuid(2)]: scorekeeperId },
      sessions: [],
    });
    const result = await readOwnResultOffers(t.as(scorekeeperId), { gameIds: ids }, t.deps);
    expect(result.ok && result.value.map((w) => w.gameId)).toEqual([gameUuid(2)]);
  });

  it('is refused to someone who may score nowhere', async () => {
    const t = list();
    const stranger = '01900000-0000-7000-8000-0000000000ff';
    expect(await readOwnResultOffers(t.as(stranger), { gameIds: ids }, t.deps)).toMatchObject({
      ok: false,
    });
    expect(t.db.state.handResultReads).toBe(0);
  });
});
