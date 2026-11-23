// Step 2.153: the read a public page's script makes for its "Score this game" buttons, over
// the made-up stand-in. Only a signed-in person who may score a game hears of it; the answer
// is never kept by a cache; the league is the address's and the account the session's; and
// a league this person may not see is "not found", exactly as one that is not there (U-9).
import { leagueApiUrl, scoringOffersLimit } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { offersAskedAtOnce } from '../features/schedule-pages/index.ts';
import { gameSnapshot } from './game-snapshot-endpoint.ts';
import { resolveLeagueApi } from './league-api.ts';
import { standInLeagues, standInPeople } from './stand-in-ports.ts';
import { askedGameIds, offerHref, scoringOffersRequest } from './scoring-offers-endpoint.ts';
import { trackerWorld, type League, type Person } from './tracker-endpoints.test-helper.ts';

const gameId = (n: number) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;
/**
 * Games 1 to 5 of the made-up league: 1 tonight and 4 in two days, final score only; 2 under
 * way; 3 tomorrow, tracked; 5 final this morning (stand-in-world-seed.ts).
 */
const firstFive = [1, 2, 3, 4, 5].map(gameId).join(',');
/** The draft league's game nobody scored, two days ago, assigned to its scorekeeper. */
const draftUnscored = '01900000-0000-7000-8000-0000b20003e8';
/** A league id nobody has. */
const noLeague = '01900000-0000-7000-8000-0000000fffff';

/**
 * The read as `person` through the address of `league` (by its id), as the route makes it;
 * with `notMoved`, its games area refuses as on the database before it has moved there.
 */
async function askById(
  person: Person,
  leagueId: string,
  games: string | null = firstFive,
  correct: string | null = null,
) {
  const world = trackerWorld();
  const { ports } = world;
  const session = person === 'visitor' ? null : await ports.identify(standInPeople[person].token);
  const parts = ['scoring'];
  const resolved = await resolveLeagueApi(
    { host: 'localhost:3000', path: leagueApiUrl({ id: leagueId }, parts), session },
    parts,
    { ...ports, siteOrigin: 'http://localhost:3000' },
    'visitor',
  );
  const read = { accessOf: ports.accessOf, games: () => ports.games.deps };
  return scoringOffersRequest(
    resolved.ok ? { ...resolved, ports: read } : resolved,
    games,
    correct,
  );
}
const ask = (person: Person, league: League = 'live', games: string | null = firstFive) =>
  askById(person, standInLeagues[league].id, games);

describe('the public pencil: "Correct this result" on a decided game (step 2.56, H5)', () => {
  const live = standInLeagues.live.id;
  it('tells whoever may reopen the decided game, leading to its reopen form in Games', async () => {
    const answer = await askById('owner', live, null, gameId(5));
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    expect(answer.body).toEqual({
      games: [],
      pencil: {
        gameId: gameId(5),
        href: `/north-valley/admin/games/${gameId(5)}`,
        label: 'Correct this result',
      },
    });
  });

  it('says nothing to a visitor, a coach or a scorekeeper who may not reopen it', async () => {
    for (const person of ['visitor', 'coach', 'scorekeeper', 'otherAdmin'] as const) {
      const answer = await askById(person, live, null, gameId(5));
      expect(answer.body, person).toEqual({ games: [] });
    }
  });

  it('says nothing of a game not decided, and keeps the buttons beside it', async () => {
    expect((await askById('owner', live, null, gameId(1))).body).toEqual({ games: [] });
    const both = await askById('owner', live, gameId(2), gameId(5));
    expect(both.body).toMatchObject({
      games: [{ gameId: gameId(2), kind: 'score' }],
      pencil: { gameId: gameId(5) },
    });
  });
});

describe('the scoring read of a public page', () => {
  it("gives a scorekeeper each game they may score, the button's kind and where it leads", async () => {
    const answer = await ask('scorekeeper');
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    // Today's game and the one under way (S-70): not tomorrow's (3) nor the one in two days (4).
    expect(answer.body).toEqual({
      games: [
        { gameId: gameId(1), kind: 'enter', href: `/north-valley/admin/games#game-${gameId(1)}` },
        { gameId: gameId(2), kind: 'score', href: `/north-valley/score/${gameId(2)}` },
      ],
      words: {
        score: 'Score this game',
        enter: 'Enter the score',
        which: '{action}: {away} against {home}',
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

  it("keeps every answer private, its 'not found' the snapshot's own for a hidden league", async () => {
    for (const refusal of [
      { status: 401, error: 'signed-out' },
      { status: 403, error: 'account-problem' },
    ] as const) {
      expect(await scoringOffersRequest({ ok: false, refusal }, firstFive)).toEqual({
        status: refusal.status,
        body: { error: refusal.error },
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    // The other public read, the snapshot, as a visitor of the draft league.
    const world = trackerWorld();
    const context = await world.contextAs('visitor', 'draft', ['games', gameId(1), 'snapshot']);
    const snapshot = await gameSnapshot(
      { context, holder: undefined, carriesSignIn: false },
      gameId(1),
      world.tracker,
    );
    expect(snapshot.status).toBe(404);
    expect(await ask('visitor', 'draft')).toEqual(snapshot);
  });

  it('answers a hidden league exactly as one that is not there or is in the bin (U-9)', async () => {
    // Each person with the leagues they may not see: another league's admin (of the empty
    // league) and another league's scorekeeper (of the live, draft and archived leagues) too.
    const hidden: readonly (readonly [Person, readonly League[]])[] = [
      ['visitor', ['draft', 'otherDraft', 'suspended']],
      ['stranger', ['draft', 'otherDraft', 'suspended']],
      ['coach', ['draft', 'otherDraft', 'suspended']],
      ['otherAdmin', ['draft', 'otherDraft', 'suspended']],
      ['scorekeeper', ['otherDraft', 'suspended']],
    ];
    for (const [person, leagues] of hidden) {
      const [unknown, binned, ...answers] = await Promise.all([
        askById(person, noLeague),
        ask(person, 'inBin'),
        ...leagues.map((league) => ask(person, league)),
      ]);
      // Compared with each other: status, body and headers, all of them.
      expect(binned, `${person}: in the bin`).toEqual(unknown);
      answers.forEach((answer, n) => expect(answer, `${person}: ${leagues[n]}`).toEqual(unknown));
      expect(unknown.status, person).toBe(404);
    }
    // The draft league's own owner, and its scorekeeper, get the ordinary answer.
    const owner = await ask('owner', 'draft');
    expect(owner.status).toBe(200);
    expect(owner.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    expect((await ask('scorekeeper', 'draft')).status).toBe(200);
  });

  // Until step 2.93 part 6 the games area refused on the database and a scorer's read was
  // answered no games; it runs there now, so whatever the games area throws is an error.
  it('answers a coach no games, never an error, and lets an error of the games area through', async () => {
    const none = {
      status: 200,
      body: { games: [] },
      headers: { 'Cache-Control': 'private, no-store' },
    };
    const leagueId = standInLeagues.live.id;
    // A coach scores nowhere: no games, and no error (that the games area is not even reached
    // is the next test's).
    expect(await askById('coach', leagueId, firstFive)).toEqual(none);
    // Whatever the games area throws is an error, never passed off as no games.
    const world = trackerWorld();
    const context = await world.contextAs('scorekeeper', 'live', ['scoring']);
    const broken = {
      accessOf: world.ports.accessOf,
      games: () => {
        throw new Error('the games area broke');
      },
    };
    await expect(
      scoringOffersRequest({ ok: true, context, ports: broken }, firstFive),
    ).rejects.toThrow('the games area broke');
  });

  it('never reaches the games area for someone who scores nowhere in the league', async () => {
    // The early "scores nowhere" check, proven on its own: core would refuse them anyway, so
    // only a games area that counts being reached tells whether the check ran first.
    const world = trackerWorld();
    const reachedBy = async (person: Person) => {
      const context = await world.contextAs(person, 'live', ['scoring']);
      let reached = 0;
      const counting = {
        accessOf: world.ports.accessOf,
        games: () => {
          reached += 1;
          return world.ports.games.deps;
        },
      };
      const answer = await scoringOffersRequest({ ok: true, context, ports: counting }, firstFive);
      return { reached, status: answer.status };
    };
    for (const person of ['coach', 'stranger', 'otherAdmin'] as const) {
      expect(await reachedBy(person), person).toEqual({ reached: 0, status: 200 });
    }
    // The counting games area is the one a scorekeeper's read does reach.
    expect(await reachedBy('scorekeeper')).toEqual({ reached: 1, status: 200 });
  });

  it('gives a scorekeeper only their assigned games where only assigned ones may score', async () => {
    // Assigned the game in two days (4, not offered until its day) and the one two days ago
    // that nobody scored (offered: it still has no result).
    const games = `${firstFive},${draftUnscored}`;
    const answer = await ask('scorekeeper', 'draft', games);
    expect(answer.body).toMatchObject({
      games: [
        {
          gameId: draftUnscored,
          kind: 'enter',
          href: `/quiet-pines/admin/games#game-${draftUnscored}`,
        },
      ],
    });
    // The league's admin, given the live games, may score every one of them on its day.
    const admin = await ask('admin', 'draft', games);
    expect(admin.body).toMatchObject({
      games: [gameId(1), gameId(2), draftUnscored].map((id) => ({ gameId: id })),
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
