import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  game,
  gameUuid,
  homeTeamId,
  memoryGames,
  ownerId,
  rules,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from '../memory-games.test-helper.ts';
import { recordForfeit } from './record-forfeit.ts';

const input = { gameId: gameUuid(1), version: 1, forfeitingTeamId: homeTeamId };

describe('recordForfeit', () => {
  it("records the other team as the winner at the season's forfeit score, and announces it", async () => {
    const forfeit = { winnerScore: 15, loserScore: 2, countsInPointDifference: true };
    const { db, deps, as, events } = memoryGames({
      games: [game(1)],
      seasons: [{ id: seasonId, programId: 'p1', rules: rules((r) => (r.forfeit = forfeit)) }],
    });
    expect(await recordForfeit(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]).toMatchObject({ status: 'forfeit', homeScore: 2, awayScore: 15 });
    expect(events.map((e) => e.type)).toEqual(['games.finalized']);
    expect(db.state.activity.map((a) => a.action)).toEqual(['games.record_forfeit']);

    const away = memoryGames({ games: [game(1)] });
    await recordForfeit(away.as(ownerId), { ...input, forfeitingTeamId: awayTeamId }, away.deps);
    expect(away.db.state.games[0]).toMatchObject({ homeScore: 20, awayScore: 0 });
  });

  it("uses the game's own forfeit score, not the season's", async () => {
    const own = rules(
      (r) => (r.forfeit = { winnerScore: 11, loserScore: 1, countsInPointDifference: false }),
    );
    const { db, deps, as } = memoryGames({
      games: [game(1, { format: own })],
      seasons: [
        {
          id: seasonId,
          programId: 'p1',
          rules: rules(
            (r) => (r.forfeit = { winnerScore: 30, loserScore: 5, countsInPointDifference: true }),
          ),
        },
      ],
    });
    await recordForfeit(as(ownerId), input, deps);
    expect(db.state.games[0]).toMatchObject({ homeScore: 1, awayScore: 11 });
  });

  it('clears the old lines of a box score game recorded now as a forfeit', async () => {
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
    // A refused forfeit changes nothing.
    const refused = memoryGames(state);
    const wrongTeam = { ...input, forfeitingTeamId: gameUuid(5) };
    expect(await recordForfeit(refused.as(ownerId), wrongTeam, refused.deps)).toMatchObject({
      ok: false,
    });
    expect(refused.db.state.lines).toHaveLength(2);
    const { db, deps, as } = memoryGames(state);
    expect(await recordForfeit(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]).toMatchObject({ status: 'forfeit', captureMode: 'final' });
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
    expect(await recordForfeit(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]?.captureMode).toBe('live');
    expect(db.state.lines).toEqual([kept]);
  });

  it('refuses a team that is not in the game, and a game that cannot be decided', async () => {
    const { deps, as } = memoryGames({ games: [game(1), game(2, { status: 'cancelled' })] });
    const code = async (extra: object) => {
      const result = await recordForfeit(as(ownerId), { ...input, ...extra }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code({ forfeitingTeamId: gameUuid(5) })).toBe('team-not-in-game');
    expect(await code({ gameId: gameUuid(2) })).toBe('game-cancelled');
    expect(await code({ gameId: gameUuid(7) })).toBe('game-not-found');
  });

  it('needs games.results: a scheduler may, a scorekeeper may not', async () => {
    const { deps, as } = memoryGames({
      games: [game(1)],
      grants: [schedulerGrant, scorekeeperGrant],
    });
    expect(await recordForfeit(as(scorekeeperId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await recordForfeit(as(schedulerId), input, deps)).toMatchObject({ ok: true });
  });
});
