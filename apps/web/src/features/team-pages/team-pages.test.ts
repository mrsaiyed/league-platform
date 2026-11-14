// The teams list, a team's page and the members' start page (step 2.44), on the made-up
// stand-in leagues: records and seeds, rosters through the one name function, statistics
// following each team's setting, and who lands where.
import { publicViewer, type AccessHolder } from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { standInPublicTeams } from '../../server/stand-in-public-teams.ts';
import { myTeamSlugOf } from '../../server/my-team-cookie.ts';
import {
  buildRoster,
  buildTeamGames,
  loadTeamCards,
  loadTeamHead,
  loadTeamStats,
} from './build-team.ts';
import { chooseMyTeam, leagueHomeStayUrl, teamIdsFromGrants } from './start-page.ts';
import { TeamCards } from './teams-page.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const member = '01900000-0000-7000-8000-0000000000a3';
const now = () => new Date('2026-11-13T15:00:00Z');
const ids = { adultLeagueId: adult, youthLeagueId: youth };
const stats = standInPublicStats(ids);
const schedules = standInPublicSchedule(ids, now);
const teams = standInPublicTeams(ids, member);
const addressee = { id: adult, slug: 'north-valley', customDomain: null } as never;

async function season(leagueId: string, index = 0) {
  const found = (await stats.seasonsOf(leagueId))[index];
  if (found === undefined) throw new Error('no season');
  return found;
}

describe('the teams list', () => {
  it('lists every team with its record and seed, by division', async () => {
    const s = await season(adult);
    const cards = await loadTeamCards(stats.readStoreOf(adult), addressee, s, s.isCurrent);
    expect(cards?.map((c) => c.name)).toEqual(['Owls', 'Falcons', 'Herons', 'Badgers', 'Otters']);
    const owls = cards?.[0];
    expect(owls?.recordText).toBe('5-1');
    expect(owls?.seedText).toBe('1');
    expect(owls?.divisionName).toBe('East');
    expect(owls?.href).toBe('/north-valley/teams/owls');
  });

  it('a past season keeps its season in the address, and a team with no place has no seed', async () => {
    const past = await season(adult, 1);
    const cards = await loadTeamCards(stats.readStoreOf(adult), addressee, past, past.isCurrent);
    expect(cards?.every((c) => c.href.endsWith('?season=spring-2026'))).toBe(true);
    expect(cards?.find((c) => c.slug === 'owls')?.seedText).toBe('Not seeded yet');
  });
});

describe('the team cards', () => {
  const card = (slug: string, divisionName: string | null) => ({
    slug,
    name: slug,
    color: null,
    href: `/x/teams/${slug}`,
    seedText: '1',
    recordText: '1-0',
    divisionName,
  });
  const html = (cards: Parameters<typeof TeamCards>[0]['cards']) =>
    renderToStaticMarkup(createElement(TeamCards, { cards }));

  it('say nothing about divisions in a league that has none', () => {
    const text = html([card('comets', null), card('rockets', null)]);
    expect(text).not.toContain('Division');
    expect(text).not.toContain('No division');
    expect(text).toContain('Seed');
  });

  it('say which team has no division in a league that has them', () => {
    const text = html([card('owls', 'East'), card('strays', null)]);
    expect(text.match(/<dt>Division<\/dt>/g)).toHaveLength(2);
    expect(text).toContain('East');
    expect(text).toContain('No division');
  });

  it('the stand-in league without divisions has none on its cards', async () => {
    const s = await season(youth);
    const cards = await loadTeamCards(
      stats.readStoreOf(youth),
      { id: youth, slug: 'harbor-city', customDomain: null } as never,
      s,
      s.isCurrent,
    );
    expect(cards?.length).toBeGreaterThan(0);
    expect(html(cards ?? [])).not.toContain('Division');
  });
});

describe('a team page', () => {
  it('has the team, its record and its roster with those who left apart', async () => {
    const s = await season(adult);
    const head = await loadTeamHead(stats.readStoreOf(adult), adult, s.id, 'falcons');
    expect(head?.team.name).toBe('Falcons');
    expect(head?.seedText).toBe('Seed 2');
    // The seed alone, for the row of facts under the team's name.
    expect(head?.seedValue).toBe('2');
    expect(head?.team.divisionName).toBe('East');
    expect(head?.recordText).toBe('5-1');
    const roster = buildRoster(
      await teams.rosterOf(adult, head?.teamId ?? '', {
        viewer: publicViewer(adult),
        policy: (await stats.settingsOf(adult)).namePolicy,
      }),
    );
    expect(roster.current.map((r) => r.name)).toContain('Dana Whitfield');
    // A person who asked to be taken off the public pages is a nameless entry (R-17).
    expect(roster.current.map((r) => r.name)).toContain('Name not shown');
    expect(roster.current.some((r) => r.name.includes('Fontaine'))).toBe(false);
    expect(roster.former.map((r) => r.name.startsWith('Pat'))).toEqual([true]);
    expect(roster.former[0]?.name).toContain('(left ');
  });

  it('is not there for a team of another season', async () => {
    const s = await season(youth);
    expect(await loadTeamHead(stats.readStoreOf(youth), youth, s.id, 'falcons')).toBeUndefined();
  });

  it('shows only the totals of a team whose players numbers are staff only (S-22)', async () => {
    const s = await season(adult);
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    const owls = await loadTeamHead(store, adult, s.id, 'owls');
    expect(owls?.statsShown).toBe('team_totals');
    const hidden = await loadTeamStats(store, settings, {
      leagueId: adult,
      seasonId: s.id,
      teamId: owls?.teamId ?? '',
    });
    expect(hidden?.playerLinesShown).toBe(false);
    expect(hidden?.playerRows).toEqual([]);
    expect(hidden?.totalsRows).toHaveLength(1);
    // The totals row names the team under a plain "Team" heading, with the team's own color.
    expect(hidden?.totalsColumns[0]?.label).toBe('Team');
    expect(hidden?.totalsRows[0]?.cells['team']).toBe('Owls');
    expect(hidden?.totalsRows[0]?.chips?.['team']).toBe(owls?.team.color);
    expect(owls?.team.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(JSON.stringify(hidden)).not.toContain('Castellanos');
    const falcons = await loadTeamHead(store, adult, s.id, 'falcons');
    const shown = await loadTeamStats(store, settings, {
      leagueId: adult,
      seasonId: s.id,
      teamId: falcons?.teamId ?? '',
    });
    expect(shown?.playerRows.map((r) => r.cells['player'])).toEqual(
      expect.arrayContaining(['Dana Whitfield', 'Marcus Oyelaran']),
    );
  });

  it('splits one teams games into the ones to play and the results', async () => {
    const s = await season(adult);
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, s.id, clock.today);
    const games = buildTeamGames(schedule, 'falcons', clock, addressee);
    expect(games.results.length).toBeGreaterThan(0);
    expect(games.upcoming.length).toBeGreaterThan(0);
    const everyGame = [...games.results, ...games.upcoming];
    expect(everyGame.every((g) => g.teamSlugs.includes('falcons'))).toBe(true);
    expect(games.results.every((g) => g.status === 'final' || g.status === 'forfeit')).toBe(true);
    expect(buildTeamGames(undefined, 'falcons', clock, addressee)).toEqual({
      upcoming: [],
      results: [],
    });
  });
});

describe('the start page', () => {
  it('has its two settings in the two stand-in leagues', async () => {
    expect(await teams.startPageOf(adult)).toBe('leagueHome');
    expect(await teams.startPageOf(youth)).toBe('myTeam');
  });

  const list = [
    { id: 'a', slug: 'bears', name: 'Bears' },
    { id: 'b', slug: 'ants', name: 'Ants' },
  ];

  it('a signed-in member lands on their own team before the one the device remembers', () => {
    expect(
      chooseMyTeam({ teams: list, grantTeamIds: [], rosterTeamIds: ['a'], rememberedSlug: 'ants' }),
    ).toBe('bears');
    expect(
      chooseMyTeam({
        teams: list,
        grantTeamIds: ['b', 'A'],
        rosterTeamIds: [],
        rememberedSlug: undefined,
      }),
    ).toBe('ants');
  });

  it('a visitor lands on the remembered team, and on none that is not in the season', () => {
    const none = { grantTeamIds: [], rosterTeamIds: [] } as const;
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: 'ants' })).toBe('ants');
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: 'gone' })).toBeUndefined();
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: '../x' })).toBeUndefined();
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: undefined })).toBeUndefined();
    expect(
      chooseMyTeam({
        teams: list,
        grantTeamIds: ['binned'],
        rosterTeamIds: [],
        rememberedSlug: undefined,
      }),
    ).toBeUndefined();
  });

  it('reads a coach or captain role on a team from the grants, and nothing else', () => {
    const grant = (role: string, scope: unknown, revokedAt: Date | null = null) =>
      ({ id: 'g', accountId: 'me', role, scope, grantedByAccountId: 'x', revokedAt }) as never;
    const holder: AccessHolder = {
      accountId: 'me',
      isOwner: false,
      grants: [
        grant('coach', { type: 'team', id: 'T1' }),
        grant('captain', { type: 'team', id: 't2' }),
        grant('coach', { type: 'team', id: 't3' }, new Date()),
        grant('coach', { type: 'league' }),
        grant('scheduler', { type: 'team', id: 't4' }),
      ],
    };
    expect(teamIdsFromGrants(holder)).toEqual(['t1', 't2']);
    expect(teamIdsFromGrants(undefined)).toEqual([]);
  });

  it('a roster place links the made-up account to a team, only in the current season', async () => {
    const winter = await season(youth);
    const [rocket] = await teams.teamIdsOfAccount(youth, winter.id, member);
    const store = stats.readStoreOf(youth);
    expect((await store.teams(winter.id)).find((t) => t.id === rocket)?.slug).toBe('rockets');
    expect(await teams.teamIdsOfAccount(youth, winter.id, 'someone-else')).toEqual([]);
  });

  it('the league home that stays is always asked for with its own address', () => {
    expect(leagueHomeStayUrl(addressee)).toBe('/north-valley?start=league');
    expect(leagueHomeStayUrl(addressee, 'spring-2026')).toBe(
      '/north-valley?season=spring-2026&start=league',
    );
    expect(myTeamSlugOf('rockets')).toBe('rockets');
    expect(myTeamSlugOf('Rockets')).toBeUndefined();
  });
});
