// The public standings' ports on the made-up database (step 2.93 part 2): the seasons a
// visitor may pick and the standings, read as the app's login role from the seed leagues
// with their seasons under way; the statistics' reads, which show people, still refuse
// (part 3), and the home page's leaders are left out rather than taking it down.
import { readStandings, readTeamRecords } from '@srleagues/core';
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { homeLeadersOf } from '../features/stats-pages/build-home-leaders.ts';
import { databasePublicStats } from './database-public-stats.ts';
import { NotOnTheDatabaseYet } from './not-on-the-database-yet.ts';
import type { PublicStatsPorts } from './public-stats.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: PublicStatsPorts;

const league = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  if (found === undefined) throw new Error(`the seed has no ${slug} league`);
  return found.leagueId;
};
const seasonOf = async (slug: string) => {
  const [season] = await ports.seasonsOf(league(slug));
  if (season === undefined) throw new Error(`${slug} has no public season`);
  return season;
};

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
  db = database.createDatabase(made.source);
  ports = databasePublicStats(database, db);
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

describe('databasePublicStats', () => {
  it('offers the season a visitor may pick, with its id', async () => {
    expect(await ports.seasonsOf(league('lakeside'))).toEqual([
      {
        id: expect.any(String) as string,
        name: 'Winter Season',
        slug: 'winter-seed',
        isCurrent: true,
      },
    ]);
  });

  it('reads the standings by division, with the played game in them', async () => {
    const season = await seasonOf('lakeside');
    const standings = await readStandings(ports.readStoreOf(league('lakeside')), {
      seasonId: season.id,
    });
    if (!standings.ok) throw new Error(`no standings: ${standings.error.code}`);
    expect(standings.value.seasonName).toBe('Winter Season');
    expect(standings.value.tables.map((t) => t.division?.name)).toEqual(['North', 'South']);
    const lines = standings.value.tables.flatMap((t) => t.lines);
    expect(lines.map((l) => l.team.name).sort()).toEqual([
      'Lakeside Foxes',
      'Lakeside Gulls',
      'Lakeside Herons',
      'Lakeside Otters',
      'Lakeside Owls',
      'Lakeside Pines',
    ]);
    expect(lines.reduce((sum, l) => sum + l.wins, 0)).toBe(2);
    expect(lines.reduce((sum, l) => sum + l.losses, 0)).toBe(2);
    const records = await readTeamRecords(ports.readStoreOf(league('lakeside')), {
      seasonId: season.id,
    });
    expect(records.ok).toBe(true);
  });

  it("finds no season of one league in another's", async () => {
    const season = await seasonOf('lakeside');
    const elsewhere = await readStandings(ports.readStoreOf(league('maple-street')), {
      seasonId: season.id,
    });
    expect(elsewhere).toEqual({ ok: false, error: { code: 'season-not-found' } });
  });

  it('refuses the statistics reads and the name settings until they move (part 3)', async () => {
    const store = ports.readStoreOf(league('lakeside'));
    const { id } = await seasonOf('lakeside');
    await expect(ports.settingsOf(league('lakeside'))).rejects.toThrow(NotOnTheDatabaseYet);
    for (const read of [
      () => store.seasonStatKeys(id),
      () => store.playerTotals(id),
      () => store.playerTeams(id),
      () => store.decidedGamesOf(id, []),
      () => store.teamStatTotals(id),
      () => store.people([]),
    ]) {
      await expect(read()).rejects.toThrow(NotOnTheDatabaseYet);
    }
    // The home page leaves its leaders out, and still shows everything else.
    expect(await homeLeadersOf(ports, { leagueId: league('lakeside'), seasonId: id })).toEqual([]);
  });
});
