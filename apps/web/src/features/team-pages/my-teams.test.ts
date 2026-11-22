// A signed-in person's own teams in one league (step 2.168): from their roster places and
// their coach or captain roles, of the current season only, by name, and never a team of
// another league, a role taken away or a role read for someone else. On the stand-in and on
// the made-up database.
import type { AccessHolder, Grant } from '@srleagues/core';
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicStats } from '../../server/database-public-stats.ts';
import { databasePublicTeams } from '../../server/database-public-teams.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { standInPublicTeams } from '../../server/stand-in-public-teams.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { myTeamStart } from './my-team-start.ts';
import { myTeamsOf, myTeamWay } from './my-teams.ts';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
/** The made-up coach: a roster place on the Herons (adult) and the Rockets (youth). */
const coach = '01900000-0000-7000-8000-0000000000a3';
/** The made-up member who signs in with a password: in three leagues, on no team. */
const member = '01900000-0000-7000-8000-0000000000ac';
const noGrants = async () => undefined;

const grant = (accountId: string, teamId: string, change: Partial<Grant> = {}): Grant => ({
  id: '01900000-0000-7000-8000-00000000f001',
  accountId,
  role: 'coach',
  scope: { type: 'team', id: teamId },
  grantedByAccountId: accountId,
  revokedAt: null,
  ...change,
});
const holderOf = (accountId: string, grants: readonly Grant[]): AccessHolder => ({
  accountId,
  isOwner: false,
  grants,
});

describe('myTeamsOf on the stand-in', () => {
  const world = testWorld(undefined, () => new Date('2026-11-13T15:00:00Z'));
  const ports = {
    publicStats: standInPublicStats(world, startingNamePolicy),
    publicTeams: standInPublicTeams(world),
  };
  const teamOf = async (leagueId: string, slug: string) => {
    const [season] = await ports.publicStats.seasonsOf(leagueId);
    const teams = await ports.publicStats.readStoreOf(leagueId).teams(season?.id ?? '');
    const team = teams.find((t) => t.slug === slug);
    if (team === undefined) throw new Error(`no ${slug}`);
    return team;
  };

  it('gives a coach their team in each league, and where each league opens for them', async () => {
    const youthTeams = await myTeamsOf(ports, {
      leagueId: youth,
      accountId: coach,
      holder: noGrants,
    });
    expect(youthTeams.teams.map((t) => t.slug)).toEqual(['rockets']);
    // The youth league starts members on their team (U-5): the same team the home sends to.
    expect(youthTeams.startsOn).toBe('rockets');
    expect(
      await myTeamStart(ports, {
        leagueId: youth,
        accountId: coach,
        holder: noGrants,
        rememberedSlug: 'comets',
      }),
    ).toBe(youthTeams.startsOn);
    const adultTeams = await myTeamsOf(ports, {
      leagueId: adult,
      accountId: coach,
      holder: noGrants,
    });
    expect(adultTeams.teams.map((t) => t.slug)).toEqual(['herons']);
    // The adult league opens on its home for everyone.
    expect(adultTeams.startsOn).toBeUndefined();
  });

  it('gives a member of no team nothing', async () => {
    for (const leagueId of [adult, youth]) {
      expect(await myTeamsOf(ports, { leagueId, accountId: member, holder: noGrants })).toEqual({
        teams: [],
        startsOn: undefined,
      });
    }
  });

  it('gives a person with two teams both, by name, and opens on the first', async () => {
    const comets = await teamOf(youth, 'comets');
    const both = await myTeamsOf(ports, {
      leagueId: youth,
      accountId: coach,
      holder: async () => holderOf(coach, [grant(coach, comets.id, { role: 'captain' })]),
    });
    expect(both.teams.map((t) => t.slug)).toEqual(['comets', 'rockets']);
    expect(both.startsOn).toBe('comets');
    expect(both.teams[0]).toEqual({
      id: comets.id,
      slug: 'comets',
      name: comets.name,
      color: comets.color,
    });
  });

  it('never counts a role taken away, a league-wide role, or a role read for someone else', async () => {
    const comets = await teamOf(youth, 'comets');
    const meteors = await teamOf(youth, 'meteors');
    const teams = await myTeamsOf(ports, {
      leagueId: youth,
      accountId: member,
      holder: async () =>
        holderOf(member, [
          grant(member, comets.id, { revokedAt: '2026-11-01T00:00:00Z' }),
          grant(member, meteors.id, { scope: { type: 'league' } }),
          grant(coach, meteors.id),
        ]),
    });
    expect(teams.teams).toEqual([]);
    // A holder that is another account's is not this one's at all.
    const elsewhere = await myTeamsOf(ports, {
      leagueId: youth,
      accountId: member,
      holder: async () => holderOf(coach, [grant(coach, comets.id)]),
    });
    expect(elsewhere.teams).toEqual([]);
  });

  it("never gives a team of another league, even for a role naming that league's team", async () => {
    const herons = await teamOf(adult, 'herons');
    const teams = await myTeamsOf(ports, {
      leagueId: youth,
      accountId: member,
      holder: async () => holderOf(member, [grant(member, herons.id)]),
    });
    expect(teams.teams).toEqual([]);
  });
});

describe('myTeamsOf on the made-up database', () => {
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
  const leagueOf = (slug: string) => {
    const found = made.leagues.find((l) => l.slug === slug);
    if (found === undefined) throw new Error(`the seed has no ${slug} league`);
    return found.leagueId;
  };

  it('gives a coach of a team of the season that team, and nothing in another league', async () => {
    const ports = {
      publicStats: databasePublicStats(database, db),
      publicTeams: databasePublicTeams(database, db),
    };
    const lakeside = leagueOf('lakeside');
    const [season] = await ports.publicStats.seasonsOf(lakeside);
    const teams = await ports.publicStats.readStoreOf(lakeside).teams(season?.id ?? '');
    const herons = teams.find((t) => t.slug === 'herons');
    if (herons === undefined) throw new Error('no herons');
    const holder = async () => holderOf(member, [grant(member, herons.id)]);
    const mine = await myTeamsOf(ports, { leagueId: lakeside, accountId: member, holder });
    expect(mine.teams.map((t) => t.slug)).toEqual(['herons']);
    expect(
      (await myTeamsOf(ports, { leagueId: leagueOf('maple-street'), accountId: member, holder }))
        .teams,
    ).toEqual([]);
  });
});

describe('myTeamWay', () => {
  const team = (slug: string) => ({ id: slug, slug, name: slug, color: null });
  it('takes a member to their one team, shows several to choose from, and says when none', () => {
    expect(myTeamWay([team('rockets')])).toEqual({ kind: 'team', slug: 'rockets' });
    expect(myTeamWay([team('comets'), team('rockets')])).toEqual({ kind: 'choose' });
    expect(myTeamWay([])).toEqual({ kind: 'none' });
  });
});
