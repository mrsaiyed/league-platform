// The games stand-in's other leagues (moreLeagues): each has the same made-up games as a
// copy of its own, with its own assignees and settings, so a league that scores assigned
// games only can be opened beside the one that does not.
import { listMyGames, readTrackerRosters, type AccessReader, type Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInGames } from './stand-in-games.ts';

const first = '01900000-0000-7000-8000-000000000001';
const second = '01900000-0000-7000-8000-000000000003';
const owner = '01900000-0000-7000-8000-0000000000a1';
const keeper = '01900000-0000-7000-8000-0000000000a5';
const admin = '01900000-0000-7000-8000-0000000000a6';
const scorekeeperIn = (leagueId: string, n: number): Grant & { leagueId: string } => ({
  leagueId,
  id: `01900000-0000-7000-8000-0000000000d${n}`,
  accountId: keeper,
  role: 'scorekeeper',
  scope: { type: 'league' },
  grantedByAccountId: owner,
  revokedAt: null,
});
const grants = [scorekeeperIn(first, 1), scorekeeperIn(second, 2)];
const accessOf = (leagueId: string): AccessReader => ({
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (account) =>
    grants.filter((g) => g.leagueId === leagueId && g.accountId === account),
});

const ports = standInGames({
  leagueId: first,
  people: { [keeper]: 'Sam' },
  assignees: [keeper, owner],
  moreLeagues: [
    {
      leagueId: second,
      assignees: [admin, keeper],
      settings: {
        'games.whoMayScore': [{ level: 'league', document: { version: 1, value: 'assignedOnly' } }],
      },
    },
  ],
  accessOf,
  log: () => {},
});
const as = (leagueId: string) => ({ leagueId, accountId: keeper, requestId: 'r1' });
const gameIds = async (leagueId: string) => {
  const listed = await listMyGames(as(leagueId), {}, ports.deps);
  return listed.ok ? listed.value.games.map((g) => g.id) : [];
};
/** Hawks v Bears, live and recorded live: the first assignee's in each league. */
const liveGame = '01900000-0000-7000-8000-006a00000002';

describe('the games stand-in’s other leagues', () => {
  it('gives another league the same games, scored there as its own settings say', async () => {
    // The first league lets any scorekeeper score any game.
    expect(await gameIds(first)).toContain(liveGame);
    expect(await readTrackerRosters(as(first), { gameId: liveGame }, ports.deps)).toMatchObject({
      ok: true,
    });
    // The other scores assigned games only, and the live game is its admin's.
    expect(await gameIds(second)).not.toContain(liveGame);
    expect(await readTrackerRosters(as(second), { gameId: liveGame }, ports.deps)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect((await ports.namesOf(second)).teams).toEqual((await ports.namesOf(first)).teams);
  });
});
