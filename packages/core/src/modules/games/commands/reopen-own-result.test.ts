import { describe, expect, it } from 'vitest';
import {
  editorId,
  finalGame,
  game,
  gameUuid,
  ownerId,
  schedulerId,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { startOfTest } from '../memory-scoring.test-helper.ts';
import { minutesSetting, otherScorekeeperId, setUp } from '../reopen-game.test-helper.ts';
import { recordFinalScore } from './record-final-score.ts';
import { reopenOwnResult } from './reopen-own-result.ts';

const gameId = gameUuid(1);
const input = { gameId, version: 1, reason: ' Typed into the wrong card ' };

/** A result recorded by hand at the start of the test, by `by`. */
function recorded(by: string | null, fields: Parameters<typeof finalGame>[1] = {}, more = {}) {
  return setUp({
    games: [finalGame(1, { finalizedAt: new Date(startOfTest).toISOString(), ...fields })],
    deciders: { [gameId]: by },
    sessions: [],
    ...more,
  });
}

const codeOf = (result: Awaited<ReturnType<typeof reopenOwnResult>>) =>
  result.ok ? 'ok' : result.error.code;

describe('reopenOwnResult (step 2.177, S-52)', () => {
  it('lets the scorekeeper who typed a final score reopen it with a reason, logged once', async () => {
    const t = setUp({ games: [game(1)], sessions: [] });
    const saved = await recordFinalScore(
      t.as(scorekeeperId),
      { gameId, version: 1, homeScore: 40, awayScore: 52 },
      t.deps,
    );
    expect(saved).toEqual({ ok: true, value: { version: 2 } });
    expect(t.db.state.deciders[gameId]).toBe(scorekeeperId);
    const result = await reopenOwnResult(t.as(scorekeeperId), { ...input, version: 2 }, t.deps);
    expect(result).toEqual({ ok: true, value: { version: 3 } });
    expect(t.db.state.games[0]).toMatchObject({
      status: 'scheduled',
      homeScore: null,
      finalizedAt: null,
    });
    expect(t.db.state.deciders[gameId]).toBeNull();
    expect(t.db.state.corrections).toEqual([
      {
        gameId,
        accountId: scorekeeperId,
        reason: 'Typed into the wrong card',
        before: { version: 1, status: 'final', homeScore: 40, awayScore: 52 },
        after: { version: 1, status: 'scheduled', homeScore: null, awayScore: null },
      },
    ]);
    expect(t.db.state.activity.map((a) => a.action)).toEqual([
      'games.record_final_score',
      'games.reopen_own_result',
    ]);
    expect(t.events.map((e) => e.type)).toEqual(['games.finalized', 'games.reopened']);
  });

  it('counts the league minutes by the server clock: exactly 30 still counts, a second more does not', async () => {
    const t = recorded(scorekeeperId);
    t.clock.advance(30 * 60);
    expect(codeOf(await reopenOwnResult(t.as(scorekeeperId), input, t.deps))).toBe('ok');
    const late = recorded(scorekeeperId);
    late.clock.advance(30 * 60 + 1);
    expect(await reopenOwnResult(late.as(scorekeeperId), input, late.deps)).toEqual({
      ok: false,
      error: { code: 'reopen-time-over', whoCan: 'games.correct', recordedBy: scorekeeperId },
    });
    expect(late.db.state.corrections).toEqual([]);
    expect(late.db.state.games[0]?.status).toBe('final');
  });

  it('follows the league setting: 0 is never, a longer time is longer', async () => {
    const never = recorded(scorekeeperId, {}, { settings: minutesSetting(0) });
    expect(codeOf(await reopenOwnResult(never.as(scorekeeperId), input, never.deps))).toBe(
      'scorekeepers-may-not-reopen',
    );
    const hour = recorded(scorekeeperId, {}, { settings: minutesSetting(60) });
    hour.clock.advance(45 * 60);
    expect(codeOf(await reopenOwnResult(hour.as(scorekeeperId), input, hour.deps))).toBe('ok');
  });

  it('refuses a scorekeeper for a result someone else recorded, and says who can', async () => {
    for (const by of [otherScorekeeperId, null]) {
      const t = recorded(by);
      expect(await reopenOwnResult(t.as(scorekeeperId), input, t.deps)).toEqual({
        ok: false,
        error: { code: 'not-recorded-by-you', whoCan: 'games.correct', recordedBy: by },
      });
      expect(t.db.state.corrections).toEqual([]);
      expect(t.db.state.activity).toEqual([]);
    }
  });

  it('covers a forfeit they recorded by hand', async () => {
    const t = recorded(scorekeeperId, { status: 'forfeit', homeScore: 2, awayScore: 0 });
    expect(codeOf(await reopenOwnResult(t.as(scorekeeperId), input, t.deps))).toBe('ok');
    expect(t.db.state.corrections[0]?.before).toEqual({
      version: 1,
      status: 'forfeit',
      homeScore: 2,
      awayScore: 0,
    });
  });

  it('lets an admin and a scheduler reopen anyone’s entry at any time', async () => {
    for (const who of [ownerId, schedulerId]) {
      const t = recorded(otherScorekeeperId);
      t.clock.advance(24 * 60 * 60);
      expect(codeOf(await reopenOwnResult(t.as(who), input, t.deps))).toBe('ok');
      expect(t.db.state.corrections[0]?.accountId).toBe(who);
    }
  });

  it('refuses someone who may not score the game, and an unsigned caller', async () => {
    const t = recorded(scorekeeperId);
    expect(codeOf(await reopenOwnResult(t.as(editorId), input, t.deps))).toBe('not-allowed');
    expect(codeOf(await reopenOwnResult(t.as(null), input, t.deps))).toBe('not-allowed');
    expect(t.db.state.corrections).toEqual([]);
  });

  it('writes one correction and one activity entry on a double tap', async () => {
    const t = recorded(scorekeeperId);
    const first = await reopenOwnResult(t.as(scorekeeperId), input, t.deps);
    const second = await reopenOwnResult(t.as(scorekeeperId), input, t.deps);
    expect(first.ok).toBe(true);
    expect(codeOf(second)).toBe('changed-since-read');
    expect(t.db.state.corrections).toHaveLength(1);
    expect(t.db.state.activity.map((a) => a.action)).toEqual(['games.reopen_own_result']);
    expect(t.events.map((e) => e.type)).toEqual(['games.reopened']);
  });

  it('leaves a game not decided, an overturned result and a missing reason alone', async () => {
    const open = setUp({ games: [game(1)], sessions: [] });
    expect(codeOf(await reopenOwnResult(open.as(scorekeeperId), input, open.deps))).toBe(
      'game-not-decided',
    );
    const overturned = recorded(scorekeeperId, { overturned: true });
    expect(
      codeOf(await reopenOwnResult(overturned.as(scorekeeperId), input, overturned.deps)),
    ).toBe('result-overturned');
    const t = recorded(scorekeeperId);
    for (const reason of [undefined, '', '   ', 'x'.repeat(1001)]) {
      const result = await reopenOwnResult(t.as(scorekeeperId), { ...input, reason }, t.deps);
      expect(codeOf(result)).toBe('invalid-input');
    }
    expect(t.db.state.corrections).toEqual([]);
  });
});
