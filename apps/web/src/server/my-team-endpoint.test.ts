// Step 2.168: the read a public page's script makes for its "your team" marks, over the
// made-up stand-in, as the route makes it. A signed-in member hears of their own teams of
// the season and where the league opens for them; someone with no team here hears of the
// team this device chose, only while the league offers the choice; a visitor with nothing
// chosen hears nothing, words included. The answer is never kept by a cache; the league is
// the address's, the account the session's, the device's choice its own cookie, checked
// against the league's teams; and a league this person may not see is "not found", exactly
// as one that is not there (U-9).
import { leagueApiUrl } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { chosenTeamOf, myTeamsOf } from '../features/team-pages/index.ts';
import { resolveLeagueApi } from './league-api.ts';
import { myTeamRequest, nothingMine } from './my-team-endpoint.ts';
import { scoringOffersRequest } from './scoring-offers-endpoint.ts';
import { standInLeagues, standInPeople } from './stand-in-ports.ts';
import { trackerWorld, type League, type Person } from './tracker-endpoints.test-helper.ts';

/** A league id nobody has. */
const noLeague = '01900000-0000-7000-8000-0000000fffff';
const privately = { 'Cache-Control': 'private, no-store' };
const words = {
  yours: 'This is your team.',
  opensHere: 'This is your team. The league opens here for you.',
  mark: 'Your team',
};

/** The read as `person` through the address of `league` (by its id), with this device's cookie. */
async function askById(person: Person, leagueId: string, remembered?: string) {
  const { ports } = trackerWorld();
  const session = person === 'visitor' ? null : await ports.identify(standInPeople[person].token);
  const parts = ['my-team'];
  const resolved = await resolveLeagueApi(
    { host: 'localhost:3000', path: leagueApiUrl({ id: leagueId }, parts), session },
    parts,
    { ...ports, siteOrigin: 'http://localhost:3000' },
    'visitor',
  );
  const read = {
    accessOf: ports.accessOf,
    myTeams: (id: string, accountId: string) =>
      myTeamsOf(ports, { leagueId: id, accountId, holder: async () => undefined }),
    chosenTeam: (id: string, slug: string | undefined) => chosenTeamOf(ports, id, slug),
  };
  return myTeamRequest(resolved.ok ? { ...resolved, ports: read } : resolved, remembered);
}
const ask = (person: Person, league: League, remembered?: string) =>
  askById(person, standInLeagues[league].id, remembered);

describe('the "your team" read of a public page', () => {
  it('gives a coach their team, and says the league opens there where it does', async () => {
    // Harbor City starts members on their team's page (U-5).
    expect(await ask('coach', 'other')).toEqual({
      status: 200,
      headers: privately,
      body: {
        teams: ['rockets'],
        startsOn: 'rockets',
        marked: [
          {
            slug: 'rockets',
            name: 'Rockets',
            color: expect.any(String),
            href: '/harbor-city/teams/rockets',
          },
        ],
        words,
      },
    });
    // North Valley opens on its home for everyone: the team, and no "opens here".
    const live = await ask('coach', 'live');
    expect(live.body).toMatchObject({ teams: ['herons'], startsOn: null, words });
    expect(live.headers).toEqual(privately);
  });

  it("never lets a device's choice stand above a member's own team", async () => {
    const answer = await ask('coach', 'other', 'comets');
    expect(answer.body).toMatchObject({ teams: ['rockets'], marked: [{ slug: 'rockets' }] });
  });

  it('marks the team a visitor chose, only where the league offers the choice, and only a team of it', async () => {
    expect((await ask('visitor', 'other', 'comets')).body).toEqual({
      teams: [],
      startsOn: null,
      marked: [
        {
          slug: 'comets',
          name: 'Comets',
          color: expect.any(String),
          href: '/harbor-city/teams/comets',
        },
      ],
      words,
    });
    // North Valley never offered "Make this my team": a cookie left from it marks nothing.
    expect((await ask('visitor', 'live', 'owls')).body).toEqual(nothingMine);
    // A name that is no team of this league, or no name at all.
    for (const remembered of ['herons-of-elsewhere', 'falcons', '../admin', 'Comets', '']) {
      expect((await ask('visitor', 'other', remembered)).body, remembered).toEqual(nothingMine);
    }
    // A signed-in person of no team here is marked the device's choice too.
    expect((await ask('stranger', 'other', 'comets')).body).toMatchObject({
      teams: [],
      marked: [{ slug: 'comets' }],
    });
  });

  it('gives a visitor, a member of no team and staff of no team nothing, words included', async () => {
    for (const person of ['visitor', 'stranger', 'owner', 'scorekeeper', 'scheduler'] as const) {
      for (const league of ['live', 'other'] as const) {
        expect(await ask(person, league), `${person} in ${league}`).toEqual({
          status: 200,
          body: nothingMine,
          headers: privately,
        });
      }
    }
  });

  it("gives one league's member nothing of their team in another league", async () => {
    // The coach is on the Rockets of Harbor City and the Herons of North Valley: each league's
    // read names its own team only.
    const [harbor, north] = await Promise.all([ask('coach', 'other'), ask('coach', 'live')]);
    expect(JSON.stringify(harbor.body)).not.toContain('herons');
    expect(JSON.stringify(north.body)).not.toContain('rockets');
  });

  it("keeps every answer private, its 'not found' the other public reads' own", async () => {
    for (const refusal of [
      { status: 401, error: 'signed-out' },
      { status: 403, error: 'account-problem' },
    ] as const) {
      expect(await myTeamRequest({ ok: false, refusal }, 'rockets')).toEqual({
        status: refusal.status,
        body: { error: refusal.error },
        headers: privately,
      });
    }
    const notFound = await myTeamRequest(
      { ok: false, refusal: { status: 404, error: 'not-found' } },
      undefined,
    );
    expect(notFound).toEqual(
      await scoringOffersRequest({ ok: false, refusal: { status: 404, error: 'not-found' } }, null),
    );
  });

  it('answers a hidden league exactly as one that is not there or is in the bin (U-9)', async () => {
    const hidden: readonly (readonly [Person, readonly League[]])[] = [
      ['visitor', ['draft', 'suspended']],
      ['stranger', ['draft', 'suspended']],
      ['otherAdmin', ['draft', 'suspended']],
      ['scorekeeper', ['otherDraft', 'suspended']],
    ];
    for (const [person, leagues] of hidden) {
      const [unknown, binned, ...answers] = await Promise.all([
        askById(person, noLeague, 'rockets'),
        ask(person, 'inBin', 'rockets'),
        ...leagues.map((league) => ask(person, league, 'rockets')),
      ]);
      expect(binned, `${person}: in the bin`).toEqual(unknown);
      answers.forEach((answer, n) => expect(answer, `${person}: ${leagues[n]}`).toEqual(unknown));
      expect(unknown.status, person).toBe(404);
    }
    // The coach is refused the draft league as a visitor is; its owner gets the ordinary answer.
    expect(await ask('coach', 'draft', 'rockets')).toEqual(
      await askById('coach', noLeague, 'rockets'),
    );
    expect(await ask('owner', 'draft')).toEqual({
      status: 200,
      body: nothingMine,
      headers: privately,
    });
  });
});
