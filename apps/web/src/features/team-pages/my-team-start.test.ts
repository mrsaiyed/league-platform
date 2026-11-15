// Where a "my team" league's home sends someone (U-5): on the stand-in a member lands on
// their own team; on the made-up database, where a member's roster places are not read
// until step 2.93 part 3 (record 069), a signed-in member is shown the league home, as
// a visitor is, never the error page.
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicStats } from '../../server/database-public-stats.ts';
import { databasePublicTeams } from '../../server/database-public-teams.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { NotOnTheDatabaseYet } from '../../server/not-on-the-database-yet.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { standInPublicTeams } from '../../server/stand-in-public-teams.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { myTeamStart } from './my-team-start.ts';

const youth = '01900000-0000-7000-8000-000000000002';
const member = '01900000-0000-7000-8000-0000000000a3';
const noGrants = async () => undefined;

describe('myTeamStart on the stand-in', () => {
  const world = testWorld(undefined, () => new Date('2026-11-13T15:00:00Z'));
  const ports = {
    publicStats: standInPublicStats(world, startingNamePolicy),
    publicTeams: standInPublicTeams(world),
  };

  it("sends a member to their own team's page", async () => {
    const start = { leagueId: youth, holder: noGrants, rememberedSlug: undefined };
    expect(await myTeamStart(ports, { ...start, accountId: member })).toBe('rockets');
    expect(await myTeamStart(ports, { ...start, accountId: null })).toBeUndefined();
  });
});

describe('myTeamStart on the made-up database', () => {
  let made: database.MadeUpDatabase;
  let db: database.DatabaseHandle;
  beforeAll(async () => {
    made = await database.madeUpDatabase({ underWay: true });
    db = database.createDatabase(made.source);
  }, 120_000);
  afterAll(async () => {
    await db.close();
    await made.close();
  });

  const portsOf = () => ({
    publicStats: databasePublicStats(database, db),
    // The league's start page set to "my team"; the roster places still refuse.
    publicTeams: {
      ...databasePublicTeams(database, db),
      startPageOf: async () => 'myTeam' as const,
    },
  });
  const lakeside = () => {
    const found = made.leagues.find((l) => l.slug === 'lakeside');
    if (found === undefined) throw new Error('the seed has no lakeside league');
    return found.leagueId;
  };

  it('shows a signed-in member the league home, not the error page, until part 3', async () => {
    const ports = portsOf();
    const [season] = await ports.publicStats.seasonsOf(lakeside());
    if (season === undefined) throw new Error('no public season');
    // The read a member's team needs still refuses on the database (part 3)...
    await expect(ports.publicTeams.teamIdsOfAccount(lakeside(), season.id, member)).rejects.toThrow(
      NotOnTheDatabaseYet,
    );
    // ...so the member stays on the league home, as a visitor does.
    const start = { leagueId: lakeside(), holder: noGrants, rememberedSlug: undefined };
    expect(await myTeamStart(ports, { ...start, accountId: member })).toBeUndefined();
    expect(await myTeamStart(ports, { ...start, accountId: null })).toBeUndefined();
  });
});
