import { describe, expect, it } from 'vitest';
import { finalGame, gameUuid, ownerId, scorekeeperId } from '../memory-games.test-helper.ts';
import { startOfTest } from '../memory-scoring.test-helper.ts';
import { endedOnTablet, otherScorekeeperId, setUp } from '../reopen-game.test-helper.ts';
import { readOwnResultOffer } from './read-own-result-offer.ts';

const gameId = gameUuid(1);
const minuteMs = 60_000;

function recorded(by: string | null) {
  return setUp({
    games: [finalGame(1, { finalizedAt: new Date(startOfTest).toISOString() })],
    deciders: { [gameId]: by },
    sessions: [],
  });
}

describe('readOwnResultOffer (step 2.177, S-52)', () => {
  it('tells the scorekeeper who recorded the result until when, by the server clock', async () => {
    const t = recorded(scorekeeperId);
    t.clock.advance(10 * 60);
    expect(await readOwnResultOffer(t.as(scorekeeperId), { gameId }, t.deps)).toEqual({
      ok: true,
      value: {
        reopen: { when: 'until', until: startOfTest + 30 * minuteMs },
        recordedBy: scorekeeperId,
      },
    });
  });

  it('says no, with the reason, once the minutes are over or for someone else’s entry', async () => {
    const late = recorded(scorekeeperId);
    late.clock.advance(31 * 60);
    expect(await readOwnResultOffer(late.as(scorekeeperId), { gameId }, late.deps)).toMatchObject({
      value: { reopen: { when: 'no', code: 'reopen-time-over' } },
    });
    const other = recorded(otherScorekeeperId);
    expect(await readOwnResultOffer(other.as(scorekeeperId), { gameId }, other.deps)).toEqual({
      ok: true,
      value: {
        reopen: { when: 'no', code: 'not-recorded-by-you' },
        recordedBy: otherScorekeeperId,
      },
    });
  });

  it('sends a game its tracker ended to the tracker’s own door, even for whoever may correct', async () => {
    const t = setUp();
    await endedOnTablet(t);
    expect(t.db.state.games[0]?.status).toBe('final');
    for (const who of [scorekeeperId, ownerId]) {
      expect(await readOwnResultOffer(t.as(who), { gameId }, t.deps)).toEqual({
        ok: true,
        value: { reopen: { when: 'no', code: 'not-recorded-by-hand' }, recordedBy: null },
      });
    }
  });

  it('is always for someone who may correct games', async () => {
    const t = recorded(otherScorekeeperId);
    t.clock.advance(24 * 60 * 60);
    expect(await readOwnResultOffer(t.as(ownerId), { gameId }, t.deps)).toMatchObject({
      value: { reopen: { when: 'always' } },
    });
  });
});
