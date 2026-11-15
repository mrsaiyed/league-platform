// The one made-up world itself (stand-in-world.ts, step 2.152): a transaction that throws
// and a command that is refused leave nothing behind; one league's rows are never reached
// from another's context; a reader cannot change the world; asking for the world inside
// one of its own transactions fails at once instead of waiting for ever; a league with no
// world is refused; a transaction copies only the tables it writes. And the stand-in
// answers only this computer (the review's M4).
import {
  createTeam,
  listMyGames,
  recordFinalScore,
  type AccessReader,
  type CommandContext,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { newTeamInput } from '../features/teams-area/form-input.ts';
import { standInLeagues, standInPeople } from './stand-in-cast.ts';
import { standInPorts } from './stand-in-ports.ts';
import { standInGameId, standInSeasonIds } from './stand-in-world-seed.ts';
import { testWorld } from './stand-in-world.test-helper.ts';
import { WorldReentered } from './stand-in-world.ts';

const adult = standInLeagues.live.id;
const youth = standInLeagues.other.id;
const fall = standInSeasonIds.adultFall;
const owner = standInPeople.owner.accountId;
const stranger = standInPeople.stranger.accountId;
const as = (leagueId: string, accountId: string): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'world-test',
});
/** Tigers v Bears, still to play, scored by its final score. */
const tigersBears = standInGameId(4);

/** The made-up owner owns every league; nobody else holds anything. */
const access = (): AccessReader => ({
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
});

describe('a transaction of the made-up world', () => {
  it('that throws leaves nothing behind', async () => {
    const world = testWorld(access);
    const before = (await world.read(adult))?.standingsRows[fall];
    await expect(
      world.deps.transaction(as(adult, owner), async (tx) => {
        await tx.standings.replaceRows(fall, []);
        await tx.teams.create({
          seasonId: fall,
          divisionId: null,
          slug: 'half-made',
          name: 'Half Made',
          color: null,
          statsVisibility: 'everyone',
        });
        throw new Error('half way');
      }),
    ).rejects.toThrow('half way');
    const after = await world.read(adult);
    expect(after?.standingsRows[fall]).toEqual(before);
    expect(after?.teams.some((t) => t.slug === 'half-made')).toBe(false);
  });

  it('whose command is refused leaves nothing behind', async () => {
    const world = testWorld(access);
    const before = await world.read(adult);
    const refused = await createTeam(
      as(adult, stranger),
      newTeamInput({ name: 'Not Allowed' }, fall),
      world.deps,
    );
    expect(refused).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    const game = before?.games.find((g) => g.id === tigersBears);
    const stale = await recordFinalScore(
      as(adult, owner),
      { gameId: tigersBears, version: (game?.version ?? 0) + 5, homeScore: 50, awayScore: 40 },
      world.deps,
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    // The very same rows: nothing was kept, not even a copy.
    expect(await world.read(adult)).toBe(before);
  });

  it('that a command keeps follows everywhere, standings included', async () => {
    const world = testWorld(access);
    const game = (await world.read(adult))?.games.find((g) => g.id === tigersBears);
    const played = (teamId: string) =>
      world
        .read(adult)
        .then((s) => s?.standingsRows[fall]?.find((r) => r.teamId === teamId)?.gamesPlayed);
    const tigers = game?.homeTeamId ?? '';
    const before = await played(tigers);
    const saved = await recordFinalScore(
      as(adult, owner),
      { gameId: tigersBears, version: game?.version ?? 0, homeScore: 50, awayScore: 40 },
      world.deps,
    );
    expect(saved.ok).toBe(true);
    expect(await played(tigers)).toBe((before ?? 0) + 1);
  });

  it("never reaches another league's rows", async () => {
    const world = testWorld(access);
    // The adult league's game asked for in the youth league's context is not there.
    const found = await world.deps.transaction(as(youth, owner), (tx) =>
      tx.games.find(tigersBears),
    );
    expect(found).toBeUndefined();
    const listed = await listMyGames(as(youth, owner), {}, world.deps);
    const adultIds = new Set((await world.read(adult))?.games.map((g) => g.id));
    expect(listed.ok && listed.value.games.some((g) => adultIds.has(g.id))).toBe(false);
    // A team made in the youth league is the youth league's alone.
    const made = await world.deps.transaction(as(youth, owner), (tx) =>
      tx.teams.create({
        seasonId: standInSeasonIds.youthWinter,
        divisionId: null,
        slug: 'only-here',
        name: 'Only Here',
        color: null,
        statsVisibility: 'everyone',
      }),
    );
    expect(typeof made).toBe('string');
    expect((await world.read(adult))?.teams.some((t) => t.slug === 'only-here')).toBe(false);
    expect((await world.read(youth))?.teams.some((t) => t.slug === 'only-here')).toBe(true);
  });

  it('copies only the tables it writes; the others are the very same rows', async () => {
    const world = testWorld(access);
    const before = await world.read(adult);
    await world.deps.transaction(as(adult, owner), async (tx) => {
      await tx.games.assign(tigersBears, stranger);
    });
    const after = await world.read(adult);
    expect(after?.assignments).not.toBe(before?.assignments);
    expect(after?.games).toBe(before?.games);
    expect(after?.events).toBe(before?.events);
    expect(after?.people).toBe(before?.people);
  });

  it('refuses a league that has no world, keeping nothing', async () => {
    const world = testWorld(access);
    await expect(
      world.deps.transaction(as('01900000-0000-7000-8000-0000000000ff', owner), async () => 'ok'),
    ).rejects.toThrow('No made-up league');
  });
});

describe('what a page reads of the made-up world', () => {
  it('cannot be changed by the reader, nor by a later transaction', async () => {
    const world = testWorld(access);
    const held = await world.read(adult);
    const count = held?.teams.length;
    expect(() => {
      (held?.teams as unknown as unknown[]).push({ id: 'not-through-a-command' });
    }).toThrow(TypeError);
    expect(() => {
      (held?.games[0] as unknown as { status: string }).status = 'final';
    }).toThrow(TypeError);
    expect((await world.read(adult))?.teams.length).toBe(count);
    // A later transaction gives the league new rows; the ones held are as they were.
    const game = held?.games.find((g) => g.id === tigersBears);
    await recordFinalScore(
      as(adult, owner),
      { gameId: tigersBears, version: game?.version ?? 0, homeScore: 50, awayScore: 40 },
      world.deps,
    );
    expect(held?.games.find((g) => g.id === tigersBears)?.status).toBe('scheduled');
    expect((await world.read(adult))?.games.find((g) => g.id === tigersBears)?.status).toBe(
      'final',
    );
  });

  it('is never asked for inside a transaction: that fails at once, by name', async () => {
    const world = testWorld(access);
    await expect(
      world.deps.transaction(as(adult, owner), async () => {
        await world.read(adult);
        return 'ended';
      }),
    ).rejects.toThrow(WorldReentered);
    await expect(
      world.deps.transaction(as(adult, owner), () =>
        world.deps.transaction(as(adult, owner), async () => 'inner'),
      ),
    ).rejects.toThrow(WorldReentered);
    // And the world carries on.
    expect(await world.deps.transaction(as(adult, owner), async () => 'after')).toBe('after');
  });
});

describe('the made-up world answers only this computer (M4)', () => {
  const ports = standInPorts({
    appEnv: 'test',
    publicBaseUrl: 'http://localhost:3000',
    log: () => {},
    emailFrom: 'hello@example.test',
  });

  it("answers this computer's names and a test name, with or without a port", () => {
    for (const host of [
      'localhost',
      'localhost:3000',
      '127.0.0.1:3000',
      '[::1]:3000',
      'app.localhost',
      'league.test:8443',
    ]) {
      expect(ports.answersHost(host), host).toBe(true);
    }
    expect(ports.madeUpWorld).toBe(true);
  });

  it('answers no other host, nor one dressed up as this computer', () => {
    for (const host of [
      '',
      'example.com',
      'srleagues.example.com:443',
      'localhost.evil.example',
      'evil.example@localhost',
      'localhost/../evil.example',
      '10.0.0.5',
      'localhost:3000 example.com',
    ]) {
      expect(ports.answersHost(host), host).toBe(false);
    }
  });
});
