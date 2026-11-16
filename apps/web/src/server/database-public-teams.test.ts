// The members' start page on the made-up database (step 2.93 part 2, record 069): the
// league's own setting as League settings saves it, the league home until one is chosen,
// and one league's choice never another's. And (part 3, record 070) a team's roster, read
// with the statistics in one snapshot, its names by the league's own audience and settings.
import { publicViewer, setSetting, type CommandDeps, type LeaguesTx } from '@srleagues/core';
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicStats } from './database-public-stats.ts';
import { databasePublicTeams } from './database-public-teams.ts';
import type { PublicStatsPorts } from './public-stats.ts';
import type { PublicTeamsPorts } from './public-teams.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: PublicTeamsPorts;
let stats: PublicStatsPorts;

const league = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  if (found === undefined) throw new Error(`the seed has no ${slug} league`);
  return found;
};

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  ports = databasePublicTeams(database, db);
  stats = databasePublicStats(database, db);
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

describe('databasePublicTeams', () => {
  it("reads the league's start page: the league home until the owner chooses the member's team", async () => {
    const lakeside = league('lakeside');
    expect(await ports.startPageOf(lakeside.leagueId)).toBe('leagueHome');
    const deps: CommandDeps<LeaguesTx> = {
      transaction: database.commandTransaction(db, (scope) => ({
        jobs: database.jobsStore(scope),
        access: database.accessStore(scope),
        activity: database.activityLogStore(scope),
        leagues: database.leaguesStore(scope),
        divisions: database.divisionsStore(scope),
      })),
      events: [],
      log: () => {},
      now: () => performance.now(),
    };
    const saved = await setSetting(
      { leagueId: lakeside.leagueId, accountId: lakeside.ownerAccountId, requestId: 'start' },
      { level: 'league', key: 'members.startPage', value: 'myTeam', version: null },
      deps,
    );
    expect(saved.ok).toBe(true);
    expect(await ports.startPageOf(lakeside.leagueId)).toBe('myTeam');
    expect(await ports.startPageOf(league('maple-street').leagueId)).toBe('leagueHome');
  });

  it('asks no database for an id that is not a UUID (part 3)', async () => {
    const { leagueId } = league('lakeside');
    expect(
      await stats.statisticsOf(leagueId, ({ rosterOf }) =>
        rosterOf('not-an-id', publicViewer(leagueId)),
      ),
    ).toEqual({ lines: [] });
    expect(
      await ports.teamIdsOfAccount(leagueId, 'not-an-id', league('lakeside').ownerAccountId),
    ).toEqual([]);
  });
});

describe('databasePublicTeams with the seasons under way', () => {
  let under: database.MadeUpDatabase;
  let underDb: database.DatabaseHandle;
  let underStats: PublicStatsPorts;
  beforeAll(async () => {
    under = await database.madeUpDatabase({ underWay: true });
    underDb = database.createDatabase(under.source);
    underStats = databasePublicStats(database, underDb);
  }, 120_000);
  afterAll(async () => {
    await underDb.close();
    await under.close();
  });

  const rosterNames = async (slug: string) => {
    const found = under.leagues.find((l) => l.slug === slug);
    if (found === undefined) throw new Error(`no ${slug}`);
    const { leagueId } = found;
    const teams = await database.withTransaction(underDb, { leagueId }, async (scope) => {
      const [season] = await database.listPublicSeasons(scope);
      return database.listSeasonTeams(scope, season?.id ?? '');
    });
    const names: (string | null)[] = [];
    for (const team of teams) {
      const roster = await underStats.statisticsOf(leagueId, ({ rosterOf }) =>
        rosterOf(team.id, publicViewer(leagueId)),
      );
      names.push(...roster.lines.map((l) => (l.name.shown ? l.name.text : null)));
    }
    return names.sort();
  };

  it('shows an adult league in full, its child with care; a youth league with care (R-14, R-15)', async () => {
    expect(await rosterNames('lakeside')).toEqual([
      'Morgan Example',
      'Quinn S.',
      'Robin Placeholder',
    ]);
    expect(await rosterNames('maple-street')).toEqual(['Casey F.', 'Jordan I.']);
  });
});
