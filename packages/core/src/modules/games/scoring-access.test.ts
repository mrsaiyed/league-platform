// Who may score a game (P4 §4, step 2.27's done test in core): under each of the
// league's two choices, an assigned and an unassigned scorekeeper are let in or
// refused; a role or an assignment taken away is refused at once (T-75). Tried
// through recording a final score, the scoring command there is today.
import { describe, expect, it } from 'vitest';
import type { Grant } from '../access/index.ts';
import { recordFinalScore } from './commands/record-final-score.ts';
import { unassignScorekeeper } from './commands/unassign-scorekeeper.ts';
import {
  game,
  gameUuid,
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
  type MemoryGames,
} from './memory-games.test-helper.ts';

const input = { gameId: gameUuid(1), version: 1, homeScore: 52, awayScore: 48 };
const assigned = (accountId: string, n = 1) => ({ gameId: gameUuid(n), accountId });
const settings = {
  default: {},
  anyScorekeeper: scoringRule('anyScorekeeper'),
  assignedOnly: scoringRule('assignedOnly'),
} as const;

/** The outcome of scoring game 1 as `account`, in a league in the given state. */
async function scores(account: string, state: Partial<MemoryGames>) {
  const { deps, as } = memoryGames({
    games: [game(1)],
    grants: [scorekeeperGrant, schedulerGrant, programAdminGrant, programScorekeeperGrant],
    ...state,
  });
  const result = await recordFinalScore(as(account), input, deps);
  return result.ok ? 'ok' : result.error.code;
}

describe('who may score a game (P4 section 4)', () => {
  for (const [name, stored] of Object.entries(settings)) {
    const only = name === 'assignedOnly';
    describe(`when the league ${name === 'default' ? 'has chosen nothing' : `chose ${name}`}`, () => {
      it(`lets an assigned scorekeeper score, and ${only ? 'refuses' : 'lets'} an unassigned one`, async () => {
        const withAssignment = { settings: stored, assignments: [assigned(scorekeeperId)] };
        expect(await scores(scorekeeperId, withAssignment)).toBe('ok');
        // Assigned to another game only.
        const elsewhere = {
          settings: stored,
          games: [game(1), game(2)],
          assignments: [assigned(scorekeeperId, 2)],
        };
        expect(await scores(scorekeeperId, elsewhere)).toBe(only ? 'not-allowed' : 'ok');
        expect(await scores(scorekeeperId, { settings: stored })).toBe(only ? 'not-allowed' : 'ok');
      });

      it('lets the owner and a scheduler score without an assignment', async () => {
        expect(await scores(ownerId, { settings: stored })).toBe('ok');
        expect(await scores(schedulerId, { settings: stored })).toBe('ok');
      });

      it("refuses a role that does not reach the game's program, assigned or not", async () => {
        const state = {
          settings: stored,
          assignments: [assigned(programScorekeeperId), assigned(programAdminId)],
        };
        expect(await scores(programScorekeeperId, state)).toBe('not-allowed');
        expect(await scores(programAdminId, state)).toBe('not-allowed');
      });

      it('refuses a scorekeeper whose role was removed, at once, though still assigned (T-75)', async () => {
        const revoked: Grant = { ...scorekeeperGrant, revokedAt: '2026-12-06T17:00:00.000Z' };
        expect(
          await scores(scorekeeperId, {
            settings: stored,
            grants: [revoked],
            assignments: [assigned(scorekeeperId)],
          }),
        ).toBe('not-allowed');
      });

      it('refuses everyone in an archived league', async () => {
        const state = {
          settings: stored,
          status: 'archived',
          assignments: [assigned(scorekeeperId)],
        };
        expect(await scores(scorekeeperId, state)).toBe('not-allowed');
        expect(await scores(ownerId, state)).toBe('not-allowed');
      });
    });
  }

  it('lets a program scorekeeper score assigned games of their own program', async () => {
    const theirs = game(1, { seasonId: otherSeasonId });
    const state = { games: [theirs], settings: settings.assignedOnly };
    expect(await scores(programScorekeeperId, state)).toBe('not-allowed');
    expect(
      await scores(programScorekeeperId, {
        ...state,
        assignments: [assigned(programScorekeeperId)],
      }),
    ).toBe('ok');
  });

  it('refuses a scorekeeper the moment their assignment is taken away', async () => {
    const { deps, as } = memoryGames({
      games: [game(1)],
      grants: [scorekeeperGrant],
      settings: settings.assignedOnly,
      assignments: [assigned(scorekeeperId)],
    });
    expect(await unassignScorekeeper(as(ownerId), assigned(scorekeeperId), deps)).toMatchObject({
      ok: true,
    });
    expect(await recordFinalScore(as(scorekeeperId), input, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });

  it('tells only those who may score anything that a game is missing', async () => {
    const state = { settings: settings.assignedOnly, games: [] };
    const missing = { ...input, gameId: gameUuid(9) };
    for (const [account, code] of [
      [scorekeeperId, 'not-allowed'],
      [ownerId, 'game-not-found'],
    ] as const) {
      const { deps, as } = memoryGames({ ...state, grants: [scorekeeperGrant] });
      const result = await recordFinalScore(as(account), missing, deps);
      expect(result.ok ? 'ok' : result.error.code).toBe(code);
    }
  });

  it('reads a stored value it cannot use as the starting value: any scorekeeper', async () => {
    const broken = {
      'games.whoMayScore': [
        { level: 'league' as const, document: { version: 1, value: 'nobody' } },
      ],
    };
    expect(await scores(scorekeeperId, { settings: broken })).toBe('ok');
  });
});
