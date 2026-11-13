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
