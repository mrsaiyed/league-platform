// Where a "my team" league's home sends someone (U-5): on the stand-in a member lands on
// their own team; on the made-up database too (step 2.93 part 3, record 070), from the
// member's roster places and team roles there.
import type { AccessHolder } from '@srleagues/core';
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicStats } from '../../server/database-public-stats.ts';
import { databasePublicTeams } from '../../server/database-public-teams.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
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
    // The league's start page set to "my team".
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

  it("reads a member's teams from the database and sends them to the one they coach", async () => {
    const ports = portsOf();
    const [season] = await ports.publicStats.seasonsOf(lakeside());
    if (season === undefined) throw new Error('no public season');
    // No seed person is linked to an account (nothing links one yet: claiming comes later),
    // so the member has no roster place; the read answers, it does not refuse.
    expect(await ports.publicTeams.teamIdsOfAccount(lakeside(), season.id, member)).toEqual([]);
    const start = { leagueId: lakeside(), holder: noGrants, rememberedSlug: undefined };
    expect(await myTeamStart(ports, { ...start, accountId: member })).toBeUndefined();
    expect(await myTeamStart(ports, { ...start, accountId: null })).toBeUndefined();
    // A member who coaches a team of the season starts on that team's page.
    const [herons] = (await ports.publicStats.readStoreOf(lakeside()).teams(season.id)).filter(
      (team) => team.slug === 'herons',
    );
    if (herons === undefined) throw new Error('no herons');
    const holder: AccessHolder = {
      accountId: member,
      isOwner: false,
      grants: [
        {
          id: member,
          accountId: member,
          role: 'coach',
          scope: { type: 'team', id: herons.id },
          grantedByAccountId: member,
          revokedAt: null,
        },
      ],
    };
    expect(
      await myTeamStart(ports, { ...start, accountId: member, holder: async () => holder }),
    ).toBe('herons');
  });
});
