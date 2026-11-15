// The public schedule's ports on the made-up database (step 2.93 part 2): the league's
// own clock, the published schedule by round and one game's facts, read as the app's
// login role from the seed leagues with their seasons under way, and nothing of one
// league asked of another.
import { dayIn } from '@srleagues/core';
import * as database from '@srleagues/database';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicSchedule } from './database-public-schedule.ts';
import type { PublicSchedulePorts } from './public-schedule.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: PublicSchedulePorts;
const clock = new Date('2026-11-15T03:30:00Z');

const league = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  if (found === undefined) throw new Error(`the seed has no ${slug} league`);
  return found.leagueId;
};
const seasonOf = async (slug: string) => {
  const [season] = await database.withTransaction(db, { leagueId: league(slug) }, (scope) =>
    database.listPublicSeasons(scope),
  );
  if (season === undefined) throw new Error(`${slug} has no public season`);
  return season.id;
};

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
  db = database.createDatabase(made.source);
  ports = databasePublicSchedule(database, db, () => clock);
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

describe('databasePublicSchedule', () => {
  it("gives the league's own day and zone at the ports' clock", async () => {
    expect(await ports.clockOf(league('lakeside'))).toEqual({
      today: dayIn('America/Chicago', clock.getTime()),
      now: clock.toISOString(),
      timeZone: 'America/Chicago',
    });
    // 03:30 in London is still the evening before in Chicago.
    expect((await ports.clockOf(league('lakeside'))).today).toBe('2026-11-14');
    expect((await ports.clockOf(league('maple-street'))).timeZone).toBe('America/New_York');
  });

  it("lists the season's published games, teams by name, the played one with its score", async () => {
    const seasonId = await seasonOf('lakeside');
    const today = dayIn('America/Chicago', Date.now());
    const schedule = await ports.scheduleOf(league('lakeside'), seasonId, today);
    if (schedule === undefined) throw new Error('no schedule');
    expect(schedule.season).toMatchObject({ slug: 'winter-seed', status: 'active' });
    const games = [...schedule.unplacedGames, ...schedule.rounds.flatMap((r) => r.games)];
    expect(games).toHaveLength(4);
    expect(games.every((g) => g.homeTeam.name.startsWith('Lakeside '))).toBe(true);
    expect(games.filter((g) => g.status === 'final').map((g) => g.homeScore !== null)).toEqual([
      true,
      true,
    ]);
  });

  it("gives one game's number, place and season, and nothing outside its season", async () => {
    const seasonId = await seasonOf('lakeside');
    const schedule = await ports.scheduleOf(league('lakeside'), seasonId, '2026-11-15');
    const game = [
      ...(schedule?.unplacedGames ?? []),
      ...(schedule?.rounds.flatMap((r) => r.games) ?? []),
    ][0];
    if (game === undefined) throw new Error('no game');
    const gameId = game.id;
    expect(await ports.gameFactsOf(league('lakeside'), seasonId, gameId)).toEqual({
      number: game.number,
      venue: null,
      courtName: null,
      season: { slug: 'winter-seed', isCurrent: true },
    });
    expect(await ports.gameFactsOf(league('lakeside'), randomUUID(), gameId)).toBeUndefined();
    expect(await ports.gameFactsOf(league('lakeside'), seasonId, 'not-an-id')).toBeUndefined();
  });

  it("shows nothing of one league's season asked of another league", async () => {
    const seasonId = await seasonOf('lakeside');
    expect(await ports.scheduleOf(league('maple-street'), seasonId, '2026-11-15')).toBeUndefined();
    expect(await ports.scheduleOf(league('lakeside'), 'not-an-id', '2026-11-15')).toBeUndefined();
  });
});
