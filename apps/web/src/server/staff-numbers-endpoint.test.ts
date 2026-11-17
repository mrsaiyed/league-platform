// Step 2.46: the signed-in read after a public page for the player numbers it leaves out,
// over the made-up stand-in (its live league keeps the Owls' and the Bears' players'
// numbers to their staff; only the Owls have any recorded). Only the league's owner and admins, and the coach of THAT team,
// get them; everyone else, and a page with nothing kept back, get the one same answer; the
// answer is never kept by a cache; the league is the address's and the account the
// session's; and a league this person may not see is "not found", as by the snapshot.
import { leagueApiUrl } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { resolveLeagueApi } from './league-api.ts';
import { standInLeagues, standInPeople } from './stand-in-ports.ts';
import { adultTeams, standInOwlsTeamId } from './stand-in-world-seed.ts';
import {
  askedStaffNumbers,
  nothingMore,
  staffNumbersParts,
  staffNumbersRequest,
} from './staff-numbers-endpoint.ts';
import { trackerWorld, type League, type Person } from './tracker-endpoints.test-helper.ts';

const world = trackerWorld();
const { ports } = world;
const gameId = (n: number) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;
/** Lions at Bears, final this morning, its final score only (stand-in-world-seed.ts). */
const bearsFinalScore = gameId(5);
/** Bears at Hawks, under way, recorded live: the Bears' names are in its plays. */
const bearsLive = gameId(2);
/** Tigers at Lions, tonight: no team of it keeps its numbers back. */
const openGame = gameId(1);
const teamId = (slug: string) => {
  const found = adultTeams.find((team) => team.slug === slug);
  if (found === undefined) throw new Error(`no ${slug}`);
  return found.id;
};
const bears = teamId('bears');
const herons = teamId('herons');

/** The Owls' first final game recorded as a box score (Owls against Falcons). */
async function owlsGame(): Promise<string> {
  const decided = await ports.publicStats
    .readStoreOf(standInLeagues.live.id)
    .decidedGames(await seasonOf());
  const falcons = teamId('falcons');
  const found = decided.find(
    (game) =>
      game.status === 'final' &&
      [game.homeTeamId, game.awayTeamId].includes(standInOwlsTeamId) &&
      [game.homeTeamId, game.awayTeamId].includes(falcons),
  );
  if (found === undefined) throw new Error('no Owls game');
  return found.gameId;
}

const seasonOf = async (league: League = 'live') => {
  const [season] = await ports.publicStats.seasonsOf(standInLeagues[league].id);
  if (season === undefined) throw new Error(`${league} has no public season`);
  return season.id;
};

/** The read as `person`, through the address of `league`, with this question. */
async function ask(person: Person, query: Record<string, string>, league: League = 'live') {
  const session = person === 'visitor' ? null : await ports.identify(standInPeople[person].token);
  const resolved = await resolveLeagueApi(
    {
      host: 'localhost:3000',
      path: leagueApiUrl({ id: standInLeagues[league].id }, staffNumbersParts),
      session,
    },
    staffNumbersParts,
    { ...ports, siteOrigin: 'http://localhost:3000' },
    'visitor',
  );
  const read = { accessOf: ports.accessOf, publicStats: ports.publicStats, tracker: ports.tracker };
  return staffNumbersRequest(
    resolved.ok ? { ...resolved, ports: read } : resolved,
    askedStaffNumbers(new URLSearchParams(query)),
  );
}

const statsQuestion = async () => ({ page: 'stats', season: await seasonOf(), by: 'total' });
const teamQuestion = async (team: string) => ({ page: 'team', season: await seasonOf(), team });
const gameQuestion = (game: string) => ({ page: 'game', game });

/** The four kinds of person the done test names, and the others who may see nothing more. */
const seeNothingMore: readonly Person[] = [
  'visitor',
  'stranger',
  'coach',
  'scheduler',
  'scorekeeper',
  'otherAdmin',
];

const text = (answer: unknown) => JSON.stringify(answer);
/** The Owls' players, as the adult league shows them (stand-in-world-seed.ts). */
const owlsPlayer = /Jordan Castellanos|Imani Brooks/;
/** The Bears' players. */
const bearsPlayer = /Bearsley/;

describe('the staff numbers read of a public page (S-22, T-87, T-95)', () => {
  it("gives the Owls' coach the statistics with the Owls' players, and says they are not public", async () => {
    const answer = await ask('teamCoach', await statsQuestion());
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    const body = answer.body as { more: { page: string; notice: { title: string; text: string } } };
    expect(body.more.page).toBe('stats');
    expect(body.more.notice).toEqual({
      title: 'Not public: shown to you as staff',
      text: "The players' numbers of Owls are shown only to the team's staff and the league's admins. Visitors see the team's totals only, so please keep these to yourself.",
    });
    expect(text(answer)).toMatch(owlsPlayer);
    // Their own team only: the Bears' players stay out, and no note says the Owls' are hidden.
    expect(text(answer)).not.toMatch(bearsPlayer);
    expect(text(answer)).not.toContain('Only team totals are shown for Owls');
  });

  it("gives the league's owner every staff-only team's players that have numbers", async () => {
    const answer = await ask('owner', await statsQuestion());
    const body = answer.body as { more: { notice: { text: string } } };
    // The Bears have no player line recorded yet: the note names the Owls alone.
    expect(body.more.notice.text).toContain("The players' numbers of Owls are");
    expect(text(answer)).toMatch(owlsPlayer);
    expect(text(answer)).not.toContain('Only team totals are shown for');
  });

  it("gives the Owls' coach their own team page's players, and nothing on another team's", async () => {
    const own = await ask('teamCoach', await teamQuestion(standInOwlsTeamId));
    expect((own.body as { more: { page: string } }).more.page).toBe('team');
    expect(text(own)).toMatch(owlsPlayer);
    expect(await ask('teamCoach', await teamQuestion(bears))).toEqual(nothingMore);
    // A team with nothing kept back, and a staff-only one with nothing recorded: the same
    // answer for everyone, the owner too.
    expect(await ask('owner', await teamQuestion(herons))).toEqual(nothingMore);
    expect(await ask('owner', await teamQuestion(bears))).toEqual(nothingMore);
  });

  it("gives the Owls' coach and the owner the Owls' box score on their game", async () => {
    const game = await owlsGame();
    for (const person of ['teamCoach', 'owner'] as const) {
      const answer = await ask(person, gameQuestion(game));
      const body = answer.body as {
        more: {
          page: string;
          view: { boxScores: { body: { kind: string; tables: { players: unknown }[] } } };
        };
      };
      expect(body.more.page, person).toBe('game');
      expect(body.more.view.boxScores.body.kind, person).toBe('tables');
      expect(
        body.more.view.boxScores.body.tables.every((table) => table.players !== null),
        person,
      ).toBe(true);
      expect(text(answer), person).toMatch(owlsPlayer);
    }
  });

  it("gives the Owls' coach nothing on the Bears' game under way", async () => {
    expect(await ask('teamCoach', gameQuestion(bearsLive))).toEqual(nothingMore);
  });

  it('answers nothing for a game with nothing kept back or no player line to add', async () => {
    expect(await ask('owner', gameQuestion(openGame))).toEqual(nothingMore);
    expect(await ask('owner', gameQuestion(bearsFinalScore))).toEqual(nothingMore);
  });

  it('answers everyone the roles let see nothing more exactly as for a page with nothing kept back', async () => {
    const questions = [
      await statsQuestion(),
      await teamQuestion(standInOwlsTeamId),
      await teamQuestion(bears),
      gameQuestion(await owlsGame()),
      gameQuestion(bearsLive),
    ];
    for (const person of seeNothingMore) {
      for (const question of questions) {
        expect(await ask(person, question), `${person} ${question.page}`).toEqual(nothingMore);
      }
    }
    expect(nothingMore).toEqual({
      status: 200,
      body: { more: null },
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });

  it('answers a question it cannot read, or that names nothing there, with the same nothing', async () => {
    for (const query of [
      {},
      { page: 'stats' },
      { page: 'stats', season: 'not-an-id' },
      { page: 'stats', season: '01900000-0000-7000-8000-00000000ffff' },
      { page: 'team', season: '01900000-0000-7000-8000-00000000ffff', team: standInOwlsTeamId },
      { page: 'game', game: '01900000-0000-7000-8000-00000000ffff' },
      { page: 'everything' },
    ]) {
      expect(await ask('owner', query), JSON.stringify(query)).toEqual(nothingMore);
    }
  });

  it("gives an admin of another league nothing through this league's address", async () => {
    // The draft league's admin, asking about the live league: no role here, so nothing.
    expect(await ask('admin', await statsQuestion())).toEqual(nothingMore);
    expect(await ask('admin', gameQuestion(await owlsGame()))).toEqual(nothingMore);
  });

  it('says "not found" for a league its visitor may not see, as the snapshot does', async () => {
    for (const person of ['visitor', 'stranger', 'teamCoach'] as const) {
      const answer = await ask(person, await statsQuestion(), 'draft');
      expect(answer, person).toEqual({
        status: 404,
        body: { error: 'not-found' },
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  });

  it('keeps every refusal private', async () => {
    const answer = await staffNumbersRequest(
      { ok: false, refusal: { status: 403, error: 'account-problem' } },
      null,
    );
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
  });
});
