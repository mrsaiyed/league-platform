import { describe, expect, it } from 'vitest';
import {
  finalGame,
  game,
  gameUuid,
  memoryGames,
  ownerId,
  programAdminGrant,
  programAdminId,
  rules,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
  editorGrant,
  editorId,
} from '../memory-games.test-helper.ts';
import { recordFinalScore } from './record-final-score.ts';

const input = { gameId: gameUuid(1), version: 1, homeScore: 52, awayScore: 48 };

describe('recordFinalScore', () => {
  it('finalizes the game, fixes its rules, logs it and announces it', async () => {
    const { db, deps, as, events } = memoryGames({ games: [game(1)] });
    expect(await recordFinalScore(as(ownerId), input, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(db.state.games[0]).toMatchObject({ status: 'final', homeScore: 52, awayScore: 48 });
    expect(db.state.games[0]?.finalizedAt).not.toBeNull();
    expect(db.state.games[0]?.format).toMatchObject({ version: 1 });
    expect(db.state.activity.map((a) => a.action)).toEqual(['games.record_final_score']);
    expect(events).toEqual([
      { type: 'games.finalized', leagueId: expect.any(String), gameId: gameUuid(1), seasonId },
    ]);
  });

  it('keeps the rules a game already has', async () => {
    const own = rules((r) => (r.allowTies = true));
    const { db, deps, as } = memoryGames({ games: [game(1, { format: own })] });
    await recordFinalScore(as(ownerId), input, deps);
    expect(db.state.games[0]?.format).toEqual(own);
  });

  it('refuses a tie unless the season allows ties', async () => {
    const tie = { ...input, homeScore: 40, awayScore: 40 };
    const strict = memoryGames({ games: [game(1)] });
    expect(await recordFinalScore(strict.as(ownerId), tie, strict.deps)).toEqual({
      ok: false,
      error: { code: 'tie-not-allowed' },
    });
    expect(strict.db.state.games[0]?.status).toBe('scheduled');
    const loose = memoryGames({
      games: [game(1)],
      seasons: [{ id: seasonId, programId: 'p1', rules: rules((r) => (r.allowTies = true)) }],
    });
    expect(await recordFinalScore(loose.as(ownerId), tie, loose.deps)).toMatchObject({ ok: true });
  });

  it('refuses a missing, binned, moved-on, decided or cancelled game, and bad scores', async () => {
    const { deps, as } = memoryGames({
      games: [
        game(2, { binned: true }),
        finalGame(3),
        game(4, { status: 'cancelled' }),
        game(1, { version: 3 }),
      ],
    });
    const code = async (extra: object) => {
      const result = await recordFinalScore(as(ownerId), { ...input, ...extra }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code({ gameId: gameUuid(9) })).toBe('game-not-found');
    expect(await code({ gameId: gameUuid(2) })).toBe('game-not-found');
    expect(await code({ gameId: gameUuid(3) })).toBe('game-already-decided');
    expect(await code({ gameId: gameUuid(4) })).toBe('game-cancelled');
    expect(await code({})).toBe('changed-since-read');
    expect(await code({ homeScore: -1 })).toBe('invalid-input');
    expect(await code({ awayScore: 1000 })).toBe('invalid-input');
  });

  it('needs games.score: scorekeepers and schedulers may, an editor may not, nor in a read-only league', async () => {
    const state = { games: [game(1)], grants: [scorekeeperGrant, schedulerGrant, editorGrant] };
    const allowed = async (account: string, status = 'published') => {
      const { deps, as } = memoryGames({ ...state, status });
      const result = await recordFinalScore(as(account), input, deps);
      return result.ok;
    };
    expect(await allowed(scorekeeperId)).toBe(true);
    expect(await allowed(schedulerId)).toBe(true);
    expect(await allowed(editorId)).toBe(false);
    expect(await allowed(ownerId, 'archived')).toBe(false);
  });

  it("checks the game's own program (P4 §4)", async () => {
    const { deps, as } = memoryGames({ games: [game(1)], grants: [programAdminGrant] });
    expect(await recordFinalScore(as(programAdminId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
