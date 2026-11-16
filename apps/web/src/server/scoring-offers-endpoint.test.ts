// Step 2.153: the read a public page's script makes for its "Score this game" buttons, over
// the made-up stand-in. Only a signed-in person who may score a game hears of it; the answer
// is never kept by a cache; the league is the address's and the account the session's.
import { scoringOffersLimit } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { offersAskedAtOnce } from '../features/schedule-pages/scoring-offers.ts';
import { askedGameIds, offerHref, scoringOffers } from './scoring-offers-endpoint.ts';
import { trackerWorld, type League, type Person } from './tracker-endpoints.test-helper.ts';

const gameId = (n: number) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;
/** Games 1 to 5 of the made-up league: 1 and 4 final score only, 2 live, 3 tracked, 5 final. */
const firstFive = [1, 2, 3, 4, 5].map(gameId).join(',');

async function ask(person: Person, league: League = 'live', games: string | null = firstFive) {
  const world = trackerWorld();
  const context = await world.contextAs(person, league, ['scoring']);
  return scoringOffers(context, games, () => world.ports.games.deps);
}

describe('the scoring read of a public page', () => {
  it("gives a scorekeeper each game they may score, the button's kind and where it leads", async () => {
    const answer = await ask('scorekeeper');
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    expect(answer.body).toEqual({
      games: [
        { gameId: gameId(1), kind: 'enter', href: `/north-valley/admin/games#game-${gameId(1)}` },
        { gameId: gameId(2), kind: 'score', href: `/north-valley/score/${gameId(2)}` },
        { gameId: gameId(3), kind: 'score', href: `/north-valley/score/${gameId(3)}` },
        { gameId: gameId(4), kind: 'enter', href: `/north-valley/admin/games#game-${gameId(4)}` },
      ],
      words: {
        score: 'Score this game',
        enter: 'Enter the score',
        which: '{away} against {home}',
      },
    });
  });

  it('gives a visitor, a coach and another league’s admin nothing, words included', async () => {
    for (const person of ['visitor', 'coach', 'otherAdmin', 'stranger'] as const) {
      const answer = await ask(person);
      expect(answer, person).toEqual({
        status: 200,
        body: { games: [] },
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
  });

  it('gives a scorekeeper only their assigned games where only assigned ones may score', async () => {
    const answer = await ask('scorekeeper', 'draft');
    expect(answer.body).toMatchObject({
      games: [{ gameId: gameId(4), kind: 'enter' }],
    });
    // The league's admin, given the live games, may score every one of them.
    const admin = await ask('admin', 'draft');
    expect(admin.body).toMatchObject({
      games: [1, 2, 3, 4].map((n) => ({ gameId: gameId(n) })),
    });
  });

  it('offers nothing in an archived league, to a scorekeeper who still holds the role there', async () => {
    expect((await ask('scorekeeper', 'archived')).body).toEqual({ games: [] });
  });

  it('asks about game ids only, each once, and no more than the read takes', () => {
    expect(askedGameIds(null)).toEqual([]);
    expect(askedGameIds(`x,${gameId(1).toUpperCase()}, ${gameId(1)},../admin`)).toEqual([
      gameId(1),
    ]);
    const many = Array.from({ length: scoringOffersLimit + 5 }, (_, n) => gameId(n + 1)).join(',');
    expect(askedGameIds(many)).toHaveLength(scoringOffersLimit);
    // The page's script asks in pieces of the same size.
    expect(offersAskedAtOnce).toBe(scoringOffersLimit);
  });

  it("leads a box score game to its grid in Games, built by the league's address helper", () => {
    const league = { slug: 'made-up' };
    expect(offerHref(league, { gameId: gameId(7), recording: 'box-score' })).toBe(
      `/made-up/admin/games/${gameId(7)}`,
    );
  });
});
