// What each decided game on a list says about putting it right, read for the person
// looking (step 2.154), against the stand-in: the admin's door for an owner, who can for
// a scorekeeper, and nothing read for a game still to be played.
import { listMyGames, type AccessReader, type Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { namesShownOf, startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInGames } from '../../server/stand-in-games.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { mayCorrectAt, readReopenViews } from './read-reopen-views.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const keeper = '01900000-0000-7000-8000-0000000000a5';
const keeperGrant: Grant = {
  id: '01900000-0000-7000-8000-0000000000d5',
  accountId: keeper,
  role: 'scorekeeper',
  scope: { type: 'league' },
  grantedByAccountId: owner,
  revokedAt: null,
};
const access: AccessReader = {
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (account) => (account === keeper ? [keeperGrant] : []),
};

async function viewsFor(accountId: string) {
  const ports = standInGames(
    testWorld(() => access),
    {
      people: {},
      namesShownOf: namesShownOf(startingNamePolicy, () => 'adult'),
    },
  );
  const context = { leagueId, accountId, requestId: 'r1' };
  const listed = await listMyGames(context, {}, ports.deps);
  const games = listed.ok ? listed.value.games : [];
  const holder =
    accountId === owner
      ? { accountId, isOwner: true, grants: [] }
      : { accountId, isOwner: false, grants: [keeperGrant] };
  return { games, views: await readReopenViews(games, context, holder, ports.deps), holder };
}

describe('reading what each decided game says about putting it right', () => {
  it('offers the owner the admin’s door on a game decided by hand, and reads only decided games', async () => {
    const { games, views } = await viewsFor(owner);
    const decided = games.filter((g) => g.status === 'final' || g.status === 'forfeit');
    expect(decided.length).toBeGreaterThan(0);
    expect([...views.keys()].sort()).toEqual(decided.map((g) => g.id).sort());
    for (const game of decided) {
      expect(views.get(game.id)).toEqual({ kind: 'correct', door: 'by-hand', until: null });
    }
  });

  it('tells a scorekeeper who can', async () => {
    const { games, views, holder } = await viewsFor(keeper);
    const decided = games.filter((g) => g.status === 'final');
    expect(decided.length).toBeGreaterThan(0);
    for (const game of decided) {
      expect(mayCorrectAt(holder, game.programId)).toBe(false);
      expect(views.get(game.id)).toEqual({ kind: 'who', because: 'admins' });
    }
  });
});
