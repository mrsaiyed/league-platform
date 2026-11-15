// The members' start page on the made-up database (step 2.93 part 2, record 069): the
// league's own setting as League settings saves it, the league home until one is chosen,
// and one league's choice never another's. The rosters still refuse (part 3).
import { setSetting, type CommandDeps, type LeaguesTx } from '@srleagues/core';
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicTeams } from './database-public-teams.ts';
import { NotOnTheDatabaseYet } from './not-on-the-database-yet.ts';
import type { PublicTeamsPorts } from './public-teams.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: PublicTeamsPorts;

const league = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  if (found === undefined) throw new Error(`the seed has no ${slug} league`);
  return found;
};

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  ports = databasePublicTeams(database, db);
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

  it('refuses the rosters and a member’s teams until the team pages move (part 3)', async () => {
    const { leagueId, ownerAccountId } = league('lakeside');
    await expect(
      ports.rosterOf(leagueId, leagueId, {} as Parameters<PublicTeamsPorts['rosterOf']>[2]),
    ).rejects.toThrow(NotOnTheDatabaseYet);
    await expect(ports.teamIdsOfAccount(leagueId, leagueId, ownerAccountId)).rejects.toThrow(
      NotOnTheDatabaseYet,
    );
  });
});
