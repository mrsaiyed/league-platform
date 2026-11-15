// The standings and statistics pages' content (step 2.43), on the made-up stand-in data
// and core's own queries: a staff-only team shows totals only to a visitor, leaders follow
// the league's minimum games, and standings carry their footnotes.
import { readStandings } from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { buildStandingsViews } from './build-standings.ts';
import { loadStatsPage, parseBy, statLabel, type StatsPageData } from './build-stats.ts';
import { chooseSeason } from './choose-season.ts';
import { StandingsTables } from './standings-page.tsx';
import { StatsTables } from './stats-page.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const stats = standInPublicStats({ adultLeagueId: adult, youthLeagueId: youth });

async function seasonsOf(leagueId: string) {
  return stats.seasonsOf(leagueId);
}

async function statsFor(leagueId: string, by: 'average' | 'total' = 'average') {
  const [season] = await seasonsOf(leagueId);
  if (season === undefined) throw new Error('no season');
  const data = await loadStatsPage(stats.readStoreOf(leagueId), await stats.settingsOf(leagueId), {
    leagueId,
    seasonId: season.id,
    by,
  });
  if ('code' in data) throw new Error(data.code);
  return data;
}

const html = (data: StatsPageData) => renderToStaticMarkup(createElement(StatsTables, { data }));

describe('seasons', () => {
  it('shows the current season, a named one, or nothing for an unknown name', async () => {
    const seasons = await seasonsOf(adult);
    expect(chooseSeason(seasons, undefined)?.slug).toBe('fall-2026');
    expect(chooseSeason(seasons, 'spring-2026')?.name).toBe('Spring 2026');
    expect(chooseSeason(seasons, 'nope')).toBeUndefined();
    expect(chooseSeason([], undefined)).toBeUndefined();
  });
});

describe('standings page', () => {
  it('draws a table per division with seeds, adjustment reasons and why teams are ordered', async () => {
    const [season] = await seasonsOf(adult);
    const result = await readStandings(stats.readStoreOf(adult), { seasonId: season?.id ?? '' });
    if (!result.ok) throw new Error('expected standings');
    const views = buildStandingsViews(result.value);
    expect(views.map((v) => v.caption)).toEqual(['East', 'West']);
    const text = renderToStaticMarkup(createElement(StandingsTables, { tables: views }));
    expect(text).toContain('Played an ineligible player in round 3.');
    expect(text).toContain('Adjusted by -1 win');
    expect(text).toContain('games they played against each other');
    expect(text).toContain('Owls');
    expect(text).toContain('Seed');
  });

  it('ranks by points for a league that does, and says when teams are still level', async () => {
    const [season] = await seasonsOf(youth);
    const result = await readStandings(stats.readStoreOf(youth), { seasonId: season?.id ?? '' });
    if (!result.ok) throw new Error('expected standings');
    const [table] = buildStandingsViews(result.value);
    expect(table?.caption).toBe('All teams');
    expect(table?.columns.map((c) => c.key)).toContain('points');
    expect(table?.footnotes.map((f) => f.id)).toContain('order-still-tied');
  });
});

describe('statistics page', () => {
  it('shows a staff-only team as totals only to a visitor (S-22)', async () => {
    const data = await statsFor(adult);
    const text = html(data);
    // The team's totals are there...
    expect(data.teamRows.find((r) => r.cells['team'] === 'Owls')?.cells['points']).toBe('39.7');
    expect(text).toContain('Owls');
    expect(text).toContain('Only team totals are shown for Owls.');
    // ...and none of its players, in the table or among the leaders.
    for (const hidden of ['Jordan', 'Castellanos', 'Imani', 'Brooks']) {
      expect(text).not.toContain(hidden);
    }
    expect(text).toContain('Dana Whitfield');
    // Nothing of the hidden numbers in the leaders either: the top scorer is not the hidden 150.
    expect(data.leaders[0]?.rows[0]?.cells['player']).toBe('1. Dana Whitfield');
  });

  it("carries each team's color for its chip, and a player's only team's color", async () => {
    const data = await statsFor(adult);
    const hex = /^#[0-9a-f]{6}$/i;
    for (const row of data.teamRows) expect(row.chips?.['team']).toMatch(hex);
    const colorOfTeam = new Map(data.teamRows.map((r) => [r.cells['team'], r.chips?.['team']]));
    expect(new Set(colorOfTeam.values()).size).toBe(data.teamRows.length);
    const dana = data.playerRows.find((r) => r.cells['player'] === 'Dana Whitfield');
    expect(dana?.chips?.['team']).toBe(colorOfTeam.get('Falcons'));
    const text = html(data);
    expect(text).toContain(`--team-color:${colorOfTeam.get('Falcons')}`);
    // One chip for each team in the teams table and one beside each player's team.
    expect(text.match(/ui-team-chip/g)).toHaveLength(data.teamRows.length + data.playerRows.length);
  });

  it('gives an empty page a next step when it is told where the schedule is', async () => {
    const data = await statsFor(adult);
    const empty = { ...data, playerRows: [], teamRows: [] };
    const told = renderToStaticMarkup(
      createElement(StatsTables, { data: empty, scheduleHref: '/north-valley/schedule' }),
    );
    expect(told).toContain('Statistics appear here once games have been played.');
    expect(told).toContain('<a class="ui-button" href="/north-valley/schedule">');
    expect(html(empty)).not.toContain('<a');
    const standings = renderToStaticMarkup(
      createElement(StandingsTables, { tables: [], scheduleHref: '/north-valley/schedule' }),
    );
    expect(standings).toContain('<a class="ui-button" href="/north-valley/schedule">');
  });

  it("follows the league's minimum games for leaders but keeps the player in the full table", async () => {
    const data = await statsFor(adult);
    const leaders = data.leaders.flatMap((b) => b.rows.map((r) => r.id));
    const theo = data.playerRows.find((r) => r.cells['player'] === 'Theo Lindqvist');
    expect(theo).toBeDefined();
    expect(leaders).not.toContain(theo?.id);
    expect(html(data)).toContain('at least 3 games');
  });

  it('shows children by first name and last initial in a youth league', async () => {
    const text = html(await statsFor(youth));
    expect(text).toContain('Sam R.');
    expect(text).not.toContain('Rivera');
  });

  it('gives season totals instead of per-game numbers when asked', async () => {
    const data = await statsFor(adult, 'total');
    expect(
      data.playerRows.find((r) => r.cells['player'] === 'Dana Whitfield')?.cells['points'],
    ).toBe('138');
    expect(parseBy('total')).toBe('total');
    expect(parseBy('anything')).toBe('average');
  });

  it('names a statistic it has words for, and shows the key of one it has not', () => {
    expect(statLabel('rebounds').short).toBe('REB');
    expect(statLabel('deflections').full).toBe('deflections');
  });
});
