import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  finalGame,
  game,
  memoryGames,
  otherSeasonId,
  ownerId,
  programAdminGrant,
  programAdminId,
  programScorekeeperGrant,
  programScorekeeperId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  seasonId,
  gameUuid,
} from '../memory-games.test-helper.ts';
import { listScorekeepers } from './list-scorekeepers.ts';

const grants = [
  scorekeeperGrant,
  schedulerGrant,
  editorGrant,
  programAdminGrant,
  programScorekeeperGrant,
];

describe('listScorekeepers', () => {
  it("lists the season's open games, soonest first, each with who is assigned", async () => {
    const { deps, as } = memoryGames({
      grants,
      games: [
        game(1, { startsAt: '2026-12-08T18:00:00.000Z' }),
        game(2, { startsAt: '2026-12-07T18:00:00.000Z', status: 'postponed' }),
        game(3, { startsAt: null }),
        finalGame(4),
        game(5, { status: 'cancelled' }),
        game(6, { binned: true }),
        game(7, { seasonId: otherSeasonId }),
      ],
      assignments: [
        { gameId: gameUuid(1), accountId: scorekeeperId },
        { gameId: gameUuid(1), accountId: schedulerId },
        { gameId: gameUuid(4), accountId: scorekeeperId },
        { gameId: gameUuid(7), accountId: scorekeeperId },
      ],
    });
    const result = await listScorekeepers(as(ownerId), { seasonId }, deps);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.games.map((g) => [g.gameId, g.status, g.assigned])).toEqual([
      [gameUuid(2), 'postponed', []],
      [gameUuid(1), 'scheduled', [scorekeeperId, schedulerId]],
      [gameUuid(3), 'scheduled', []],
    ]);
  });

  it('names everyone who may score the season, and who scores every game anyway', async () => {
    const people = async (rule: 'anyScorekeeper' | 'assignedOnly') => {
      const { deps, as } = memoryGames({ grants, settings: scoringRule(rule) });
      const result = await listScorekeepers(as(ownerId), { seasonId }, deps);
      if (!result.ok) throw new Error(result.error.code);
      return { rule: result.value.rule, people: result.value.people };
    };
    // Not the editor (no scoring) nor the program p2 admin or scorekeeper (not this season's).
    expect(await people('assignedOnly')).toEqual({
      rule: 'assignedOnly',
      people: [
        { accountId: ownerId, scoresEveryGame: true },
        { accountId: scorekeeperId, scoresEveryGame: false },
        { accountId: schedulerId, scoresEveryGame: true },
      ],
    });
    expect((await people('anyScorekeeper')).people).toContainEqual({
      accountId: scorekeeperId,
      scoresEveryGame: true,
    });
  });

  it('leaves out a role that was taken away', async () => {
    const { deps, as } = memoryGames({
      grants: [{ ...scorekeeperGrant, revokedAt: '2026-12-01T00:00:00.000Z' }],
    });
    const result = await listScorekeepers(as(ownerId), { seasonId }, deps);
    expect(result.ok && result.value.people.map((p) => p.accountId)).toEqual([ownerId]);
  });

  it("is only for someone who manages the season's games", async () => {
    const code = async (accountId: string) => {
      const { deps, as } = memoryGames({ grants });
      const result = await listScorekeepers(as(accountId), { seasonId }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code(ownerId)).toBe('ok');
    expect(await code(schedulerId)).toBe('ok');
    for (const id of [scorekeeperId, editorId, programAdminId, programScorekeeperId]) {
      expect(await code(id)).toBe('not-allowed');
    }
    // The admin of program p2 manages the other season's games.
    const { deps, as } = memoryGames({ grants });
    expect((await listScorekeepers(as(programAdminId), { seasonId: otherSeasonId }, deps)).ok).toBe(
      true,
    );
  });

  it('says a season that is not there is not found', async () => {
    const { deps, as } = memoryGames({ grants });
    const missing = '01900000-0000-7000-8000-0000000000c9';
    expect(await listScorekeepers(as(ownerId), { seasonId: missing }, deps)).toEqual({
      ok: false,
      error: { code: 'season-not-found' },
    });
  });
});
