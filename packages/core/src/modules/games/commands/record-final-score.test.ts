import { tablePlayerEventTypes } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { lockingTracker, memoryTracker } from '../memory-tracker.test-helper.ts';
import type { NewGameEvent } from '../ports.ts';
import { leaseMs } from '../scoring-session.ts';
import { applyTrackerCommands } from './apply-tracker-commands.ts';
import {
  finalGame,
  game,
  gameUuid,
  homeTeamId,
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

  it('clears the old lines of a box score game saved now as a final score only', async () => {
    const lineOf = (n: number) => ({
      gameId: gameUuid(n),
      teamId: game(n).homeTeamId,
      personId: `01900000-0000-7000-8000-0000000d000${n}`,
      played: true,
      secondsPlayed: null,
      stats: { points: 20 },
    });
    const state = {
      games: [game(1, { captureMode: 'box' }), game(2, { captureMode: 'box' })],
      lines: [lineOf(1), lineOf(2)],
    };
    // A refused save changes nothing.
    const refused = memoryGames(state);
    const tie = { ...input, homeScore: 40, awayScore: 40 };
    expect(await recordFinalScore(refused.as(ownerId), tie, refused.deps)).toMatchObject({
      ok: false,
    });
    expect(refused.db.state.lines).toHaveLength(2);
    const { db, deps, as } = memoryGames(state);
    expect(await recordFinalScore(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]).toMatchObject({ status: 'final', captureMode: 'final' });
    // Only that game's lines go, so they no longer count in totals.
    expect(db.state.lines).toEqual([lineOf(2)]);
  });

  it('leaves the lines of a game that was not a box score alone', async () => {
    const kept = {
      gameId: gameUuid(1),
      teamId: game(1).homeTeamId,
      personId: '01900000-0000-7000-8000-0000000d0001',
      played: true,
      secondsPlayed: null,
      stats: { points: 20 },
    };
    const { db, deps, as } = memoryGames({
      games: [game(1, { captureMode: 'live' })],
      lines: [kept],
    });
    expect(await recordFinalScore(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]?.captureMode).toBe('live');
    expect(db.state.lines).toEqual([kept]);
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

  it("judges a tie by the game's own rules, not the season's", async () => {
    const tie = { ...input, homeScore: 40, awayScore: 40 };
    // The season allows ties; the game's own rules do not.
    const strictGame = memoryGames({
      games: [game(1, { format: rules((r) => (r.allowTies = false)) })],
      seasons: [{ id: seasonId, programId: 'p1', rules: rules((r) => (r.allowTies = true)) }],
    });
    expect(await recordFinalScore(strictGame.as(ownerId), tie, strictGame.deps)).toMatchObject({
      error: { code: 'tie-not-allowed' },
    });
    // The season forbids ties; the game's own rules allow them.
    const looseGame = memoryGames({
      games: [game(1, { format: rules((r) => (r.allowTies = true)) })],
    });
    expect(await recordFinalScore(looseGame.as(ownerId), tie, looseGame.deps)).toMatchObject({
      ok: true,
    });
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

describe('recordFinalScore over a game the live tracker scores (S-46)', () => {
  const live = game(1, { status: 'live', captureMode: 'live', homeScore: 12, awayScore: 9 });
  const event = (seq: number, type: string): NewGameEvent => ({
    gameId: gameUuid(1),
    seq,
    commandId: `01900000-0000-7000-8000-00000000e00${seq}`,
    type,
    payload: {},
    tappedAt: 0,
    accountId: scorekeeperId,
  });

  it('refuses a game with plays, whoever sends it, and the game stays live with its plays', async () => {
    const grants = [scorekeeperGrant, schedulerGrant];
    for (const account of [ownerId, schedulerId, scorekeeperId]) {
      const { db, deps, as, events } = memoryTracker({
        games: [live],
        grants,
        events: [event(1, 'lineup'), event(2, 'score')],
      });
      expect(await recordFinalScore(as(account), input, deps), account).toEqual({
        ok: false,
        error: { code: 'game-is-tracked' },
      });
      expect(db.state.games[0]).toEqual(live);
      expect(db.state.events).toHaveLength(2);
      expect(db.state.activity).toEqual([]);
      expect(events).toEqual([]);
    }
  });

  it('refuses a scheduled game the tracker has begun to score', async () => {
    const { db, deps, as } = memoryGames({
      games: [game(1, { captureMode: 'live' })],
      tracked: [gameUuid(1)],
    });
    expect(await recordFinalScore(as(ownerId), input, deps)).toMatchObject({
      error: { code: 'game-is-tracked' },
    });
    expect(db.state.games[0]?.status).toBe('scheduled');
  });

  it('still finishes a game set to live tracking that has no plays yet', async () => {
    // Only players added at the scorer's table: they are not plays (record 058).
    const { db, deps, as } = memoryTracker({
      games: [game(1, { captureMode: 'live' })],
      events: [event(1, tablePlayerEventTypes[0])],
    });
    expect(await recordFinalScore(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]).toMatchObject({ status: 'final', homeScore: 52, awayScore: 48 });
  });

  it("takes the game's lock (T-111): a batch of lineups and a typed score never pass each other", async () => {
    const homePlayer = '01900000-0000-7000-8000-000000010001';
    const lineups = {
      gameId: gameUuid(1),
      protocolVersion: 1,
      sessionId: sessionUuid(1),
      commands: [
        {
          commandId: '01900000-0000-7000-8000-0000c0000001',
          at: startOfTest,
          input: { type: 'lineup' as const, side: 'home' as const, playerIds: [homePlayer] },
        },
      ],
    };
    /** The first to take the lock holds it until the second has started and is waiting. */
    const race = async (first: 'batch' | 'score') => {
      let letGo = () => {};
      const held = new Promise<void>((resolve) => (letGo = resolve));
      let locks = 0;
      const t = lockingTracker(
        {
          games: [game(1, { captureMode: 'live' })],
          grants: [scorekeeperGrant],
          sessions: [
            {
              id: sessionUuid(1),
              gameId: gameUuid(1),
              accountId: scorekeeperId,
              deviceId: 'tablet',
              since: startOfTest,
              heldUntil: startOfTest + leaseMs,
            },
          ],
          players: [
            { personId: homePlayer, teamId: homeTeamId, jerseyNumber: '4', onGameDay: true },
          ],
        },
        async () => {
          locks += 1;
          if (locks === 1) await held;
        },
      );
      const batch = () => applyTrackerCommands(t.as(scorekeeperId), lineups, t.deps);
      const score = () => recordFinalScore(t.as(ownerId), input, t.deps);
      const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
      const one = first === 'batch' ? batch() : score();
      await tick();
      let twoDone = false;
      const two = (first === 'batch' ? score() : batch()).finally(() => (twoDone = true));
      await tick();
      // The second is waiting for the game: it has not got it, and has not finished.
      expect([locks, twoDone]).toEqual([1, false]);
      letGo();
      await Promise.all([one, two]);
      return { t, typed: await (first === 'batch' ? two : one) };
    };

    // The batch holds the game first: the typed score waits, then sees the lineups (S-46).
    const batchFirst = await race('batch');
    expect(batchFirst.typed).toEqual({ ok: false, error: { code: 'game-is-tracked' } });
    expect(batchFirst.t.db.state.events.map((e) => e.type)).toEqual(['lineup']);
    expect(batchFirst.t.db.state.games[0]?.status).not.toBe('final');

    // The typed score holds the game first: it is saved before the batch is looked at.
    const scoreFirst = await race('score');
    expect(scoreFirst.typed).toMatchObject({ ok: true });
    expect(scoreFirst.t.db.state.games[0]).toMatchObject({
      status: 'final',
      homeScore: 52,
      awayScore: 48,
    });
  });

  it('counts only the plays since the game was last marked not started (record 061)', async () => {
    const marked = memoryTracker({
      games: [game(1, { captureMode: 'live' })],
      events: [event(1, 'lineup'), event(2, 'score'), event(3, 'reset')],
    });
    expect(await recordFinalScore(marked.as(ownerId), input, marked.deps)).toMatchObject({
      ok: true,
    });
    const again = memoryTracker({
      games: [game(1, { captureMode: 'live' })],
      events: [event(1, 'score'), event(2, 'reset'), event(3, 'lineup')],
    });
    expect(await recordFinalScore(again.as(ownerId), input, again.deps)).toMatchObject({
      error: { code: 'game-is-tracked' },
    });
  });
});
