// Step 2.153: which of a public page's games the signed-in person may score. The button on
// a card must follow exactly the rule the scoring commands enforce, so the last test asks
// the commands' own policy (mayScoreGame) and the one rule (mayScoreUnder) about every
// role, program and assignment, under both of the league's choices, and compares.
import { describe, expect, it } from 'vitest';
import { accessOfAccount, type Grant } from '../../access/index.ts';
import {
  editorGrant,
  editorId,
  finalGame,
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
} from '../memory-games.test-helper.ts';
import { mayScoreGame } from '../policy.ts';
import { mayScoreUnder, scoringRuleOf } from '../scoring-access.ts';
import { listScoringOffers, scoringOffersLimit } from './list-scoring-offers.ts';

const grants = [
  scorekeeperGrant,
  schedulerGrant,
  editorGrant,
  programAdminGrant,
  programScorekeeperGrant,
];
const games = [
  game(1, { captureMode: 'live' }),
  game(2, { captureMode: 'final' }),
  game(3, { captureMode: 'box', status: 'live' }),
  // Never offered: decided, put off, called off, in the bin.
  finalGame(4, { captureMode: 'live' }),
  game(5, { captureMode: 'live', status: 'postponed' }),
  game(6, { captureMode: 'live', status: 'cancelled' }),
  game(7, { captureMode: 'live', binned: true }),
  game(8, { captureMode: 'final', status: 'forfeit' }),
  // Of the other season's program, p2.
  game(9, { captureMode: 'live', seasonId: otherSeasonId }),
];
const every = games.map((g) => g.id);

async function offers(account: string | null, gameIds: readonly string[], state = {}) {
  const { deps, as } = memoryGames({ games, grants, ...state });
  const result = await listScoringOffers(as(account), { gameIds }, deps);
  return result.ok ? result.value.games : result.error.code;
}

describe('listScoringOffers', () => {
  it('offers the games still to be decided, in the order asked, with how each is recorded', async () => {
    expect(await offers(scorekeeperId, [gameUuid(3), ...every])).toEqual([
      { gameId: gameUuid(3), recording: 'box-score' },
      { gameId: gameUuid(1), recording: 'live' },
      { gameId: gameUuid(2), recording: 'final-score' },
      { gameId: gameUuid(9), recording: 'live' },
    ]);
    // A scorekeeper of the other program only is offered that program's game only.
    expect(await offers(programScorekeeperId, every)).toEqual([
      { gameId: gameUuid(9), recording: 'live' },
    ]);
  });

  it('answers for ids in any case, once each, and leaves out ids of no game here', async () => {
    const unknown = '01900000-0000-7000-8000-0000000bffff';
    expect(await offers(scorekeeperId, [gameUuid(1).toUpperCase(), gameUuid(1), unknown])).toEqual([
      { gameId: gameUuid(1), recording: 'live' },
    ]);
    expect(await offers(scorekeeperId, [])).toEqual([]);
  });

  it('refuses a visitor and anyone who scores nowhere here, and so says nothing of any game', async () => {
    expect(await offers(null, every)).toBe('not-allowed');
    expect(await offers(editorId, every)).toBe('not-allowed');
  });

  it('offers nothing while the league is archived or suspended', async () => {
    for (const status of ['archived', 'suspended']) {
      expect(await offers(ownerId, every, { status })).toEqual([]);
    }
  });

  it('gives a scorekeeper only their assigned games where only assigned ones may score', async () => {
    const state = {
      settings: scoringRule('assignedOnly'),
      assignments: [{ gameId: gameUuid(2), accountId: scorekeeperId }],
    };
    expect(await offers(scorekeeperId, every, state)).toEqual([
      { gameId: gameUuid(2), recording: 'final-score' },
    ]);
    // A scheduler and the owner score any game, assigned or not.
    expect(await offers(schedulerId, every, state)).toHaveLength(4);
    expect(await offers(ownerId, every, state)).toHaveLength(4);
  });

  it('takes no more games than its limit at once', async () => {
    const many = Array.from({ length: scoringOffersLimit + 1 }, (_, i) => gameUuid(100 + i));
    expect(await offers(ownerId, many)).toBe('invalid-input');
  });

  it("follows the scoring commands' own rule for every role, program and assignment", async () => {
    const revoked: Grant = { ...scorekeeperGrant, revokedAt: '2026-12-06T17:00:00.000Z' };
    const coachId = '01900000-0000-7000-8000-0000000000a5';
    const coachGrant: Grant = {
      ...scorekeeperGrant,
      id: '01900000-0000-7000-8000-0000000000f6',
      accountId: coachId,
      role: 'coach',
      scope: { type: 'team', id: 't1' },
    };
    // Both programs' games, still to be played, recorded live.
    const open = [game(1, { captureMode: 'live' }), game(9, { seasonId: otherSeasonId })];
    const accounts = [
      ownerId,
      scorekeeperId,
      schedulerId,
      editorId,
      programAdminId,
      programScorekeeperId,
      coachId,
    ];
    let compared = 0;
    for (const rule of ['anyScorekeeper', 'assignedOnly'] as const) {
      for (const withRevoked of [false, true]) {
        for (const assignedTo of [[], [1], [9], [1, 9]]) {
          for (const account of accounts) {
            const state: Partial<MemoryGames> = {
              games: open,
              grants: [
                ...grants.filter((g) => !(withRevoked && g === scorekeeperGrant)),
                ...(withRevoked ? [revoked] : []),
                coachGrant,
              ],
              settings: scoringRule(rule),
              assignments: assignedTo.map((n) => ({ gameId: gameUuid(n), accountId: account })),
            };
            const { deps, as } = memoryGames(state);
            const listed = await listScoringOffers(
              as(account),
              { gameIds: open.map((g) => g.id) },
              deps,
            );
            const offered = listed.ok ? listed.value.games.map((o) => o.gameId) : [];
            for (const g of open) {
              const label = `${account} ${rule} revoked:${withRevoked} assigned:${assignedTo} ${g.id}`;
              const [commands, oneRule] = await deps.transaction(as(account), async (tx) => {
                const holder = await accessOfAccount(tx, account);
                const programId = g.seasonId === otherSeasonId ? 'p2' : 'p1';
                return [
                  await mayScoreGame(as(account), tx, g.id),
                  holder !== undefined &&
                    mayScoreUnder(
                      holder,
                      { type: 'program', id: programId },
                      await scoringRuleOf(tx),
                      assignedTo.includes(g.id === gameUuid(1) ? 1 : 9),
                    ),
                ] as const;
              });
              expect(offered.includes(g.id), label).toBe(commands);
              expect(oneRule, label).toBe(commands);
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBe(2 * 2 * 4 * accounts.length * open.length);
  });
});
