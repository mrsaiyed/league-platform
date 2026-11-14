import { describe, expect, it } from 'vitest';
import {
  finalGame,
  game,
  gameUuid,
  ownerId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { memoryTracker } from '../memory-tracker.test-helper.ts';
import { reopenGame } from './reopen-game.ts';

const input = { gameId: gameUuid(1), version: 1, reason: ' Home score was entered wrong ' };

describe('reopenGame', () => {
  it('reopens a final game with a correction row, a log entry and an event', async () => {
    const { db, deps, as, events } = memoryTracker({ games: [finalGame(1)] });
    expect(await reopenGame(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]).toMatchObject({
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      finalizedAt: null,
    });
    expect(db.state.corrections).toEqual([
      {
        gameId: gameUuid(1),
        accountId: ownerId,
        reason: 'Home score was entered wrong',
        before: { version: 1, status: 'final', homeScore: 52, awayScore: 48 },
        after: { version: 1, status: 'scheduled', homeScore: null, awayScore: null },
      },
    ]);
    expect(events.map((e) => e.type)).toEqual(['games.reopened']);
    expect(db.state.activity.map((a) => a.action)).toEqual(['games.reopen_game']);
  });

  it('sends a game decided by hand back to scheduled with no score, planned live or not, and a forfeit too', async () => {
    const { db, deps, as } = memoryTracker({
      games: [finalGame(1, { captureMode: 'live' }), finalGame(2, { status: 'forfeit' })],
    });
    await reopenGame(as(ownerId), input, deps);
    await reopenGame(as(ownerId), { ...input, gameId: gameUuid(2) }, deps);
    expect(db.state.games[0]).toMatchObject({
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
    });
    expect(db.state.games[1]).toMatchObject({ status: 'scheduled', homeScore: null });
  });

  it('is refused without a reason, and leaves nothing behind', async () => {
    const { db, deps, as, events } = memoryTracker({ games: [finalGame(1)] });
    for (const reason of [undefined, '', '   ', 'x'.repeat(1001)]) {
      const result = await reopenGame(as(ownerId), { ...input, reason }, deps);
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    expect(db.state.games[0]?.status).toBe('final');
    expect(db.state.corrections).toEqual([]);
    expect(events).toEqual([]);
  });

  it('refuses a game that is not decided, missing or moved on', async () => {
    const { deps, as } = memoryTracker({ games: [game(1), finalGame(2, { version: 4 })] });
    const code = async (extra: object) => {
      const result = await reopenGame(as(ownerId), { ...input, ...extra }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code({})).toBe('game-not-decided');
    expect(await code({ gameId: gameUuid(2) })).toBe('changed-since-read');
    expect(await code({ gameId: gameUuid(6) })).toBe('game-not-found');
  });

  it('refuses a call with no account as not allowed', async () => {
    const { db, deps, as } = memoryTracker({ games: [finalGame(1)] });
    expect(await reopenGame(as(null), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.corrections).toEqual([]);
  });

  it('needs games.correct: a scheduler may, a scorekeeper may not', async () => {
    const { db, deps, as } = memoryTracker({
      games: [finalGame(1)],
      grants: [schedulerGrant, scorekeeperGrant],
    });
    expect(await reopenGame(as(scorekeeperId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.corrections).toEqual([]);
    expect(await reopenGame(as(schedulerId), input, deps)).toMatchObject({ ok: true });
  });
});
