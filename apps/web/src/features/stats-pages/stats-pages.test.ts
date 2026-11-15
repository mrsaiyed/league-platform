// The standings and statistics pages' content (step 2.43), on the made-up stand-in data
// and core's own queries: a staff-only team shows totals only to a visitor, leaders follow
// the league's minimum games, and standings carry their footnotes.
import { readStandings } from '@srleagues/core';
import { en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildStandingsViews } from './build-standings.ts';
import { loadStatsPage, parseBy, statLabel, type StatsPageData } from './build-stats.ts';
import { chooseSeason } from './choose-season.ts';
import { StandingsTables } from './standings-page.tsx';
import { StatsTables } from './stats-page.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const stats = standInPublicStats(testWorld(), startingNamePolicy);

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
    // (56 + 58 + 41) / 3, from the Owls' box score lines.
    expect(data.teamRows.find((r) => r.cells['team'] === 'Owls')?.cells['points']).toBe('51.7');
    expect(text).toContain('Owls');
    // The Bears keep their players' numbers for their staff too.
    expect(text).toContain('Only team totals are shown for Bears, Owls.');
    // ...and none of its players, in the table or among the leaders.
    for (const hidden of ['Jordan', 'Castellanos', 'Imani', 'Brooks']) {
      expect(text).not.toContain(hidden);
    }
    expect(text).toContain('Dana Whitfield');
    // Nothing of the hidden numbers in the leaders either: the top scorer is not the hidden
    // one (29 a game over three games, more than anyone shown).
    expect(data.leaders[0]?.rows[0]?.cells['player']).toBe('1. Dana Whitfield');
  });

  it('gives fouls and turnovers no leaders card, and keeps them in the tables (S-48)', async () => {
    const data = await statsFor(adult);
    const cards = data.leaders.map((board) => board.key);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards).not.toContain('fouls');
    expect(cards).not.toContain('turnovers');
    // What the made-up league records of the two (fouls) is still a column of the
    // players' table and of the teams' table.
    const columns = data.playerColumns.map((column) => column.key);
    expect(columns).toContain('fouls');
    expect(data.teamColumns.map((column) => column.key)).toContain('fouls');
    // Every other statistic of the sport has its card.
    expect(cards).toEqual(
      columns.filter((key) => !['player', 'team', 'games', 'fouls', 'turnovers'].includes(key)),
    );
  });

  it('opens with a number card for who leads each statistic, the first on the main color', async () => {
    const data = await statsFor(adult);
    const text = html(data);
    // The made-up season has no tie for first place (a statistic with one has no card: the
    // test below).
    const boards = data.leaders.filter((board) => board.first !== undefined && !board.first.tied);
    expect(boards.length).toBeGreaterThan(0);
    expect(boards).toHaveLength(data.leaders.filter((board) => board.rows.length > 0).length);
    // One card for each of the first three boards, each at the head of its own column.
    const cards = Math.min(boards.length, 3);
    expect(text.match(/<article class="ui-spot"/g)).toHaveLength(cards);
    expect(text.match(/<article class="ui-spot" data-first="true"/g)).toHaveLength(1);
    expect(text.match(/<li class="stats-leader"><article class="ui-spot"/g)).toHaveLength(cards);
    for (const board of boards.slice(0, 3)) {
      // The same person, name and number as the first line of that board's list.
      const top = board.rows[0];
      expect(board.first?.id).toBe(top?.id);
      expect(top?.cells['player']).toBe(`1. ${board.first?.name}`);
      expect(board.first?.value).toBe(top?.cells['value']);
      expect(text).toContain(`<p class="ui-spot-label">${board.title} leader</p>`);
      // Under the section's own title ("Leaders", level two): the name is level three.
      expect(text).toContain(`<h3 class="ui-spot-name" dir="auto">${board.first?.name}</h3>`);
      // The leader is on the card and is not said again as the first line of the list:
      // the list goes on from second place.
      expect(text).not.toContain(`>1. ${board.first?.name}<`);
      const second = board.rows[1]?.cells['player'];
      if (second !== undefined) expect(text).toContain(`>${String(second)}<`);
    }
    expect(text.indexOf('<h2>Leaders</h2>')).toBeLessThan(text.indexOf('ui-spot-row'));
    // The rest of a statistic's list stands right under its own card, in the same column,
    // with its title kept for screen readers; no sentence has to explain where a list starts.
    expect(
      text.match(
        /<\/article><article class="ui-leader-card" data-after-leader="true"><h3 class="ui-visually-hidden">/g,
      ),
    ).toHaveLength(boards.slice(0, 3).filter((board) => board.rows.length > 1).length);
    expect(text).not.toContain('goes on from second place');
    expect(Object.keys(en)).not.toContain('stats.afterLeader');
    // Never for fouls or turnovers.
    expect(text).not.toContain('Fouls leader');
    expect(text).not.toContain('Turnovers leader');
  });

  // A page's data made by hand: `names` statistics, each led by its own made-up player,
  // with second place shared or not.
  const madeUp = (names: readonly string[], tiedFirst: readonly string[] = []): StatsPageData => ({
    by: 'average',
    minimumGames: 0,
    leaders: names.map((name, n) => {
      const tied = tiedFirst.includes(name);
      const row = (place: number, who: string, value: string) => ({
        id: `${name}-${who}`,
        cells: { player: `${place}. ${who}`, team: 'Owls', games: 3, value },
      });
      return {
        key: name.toLowerCase(),
        title: name,
        columns: [],
        first: {
          id: `${name}-Ada ${n}`,
          name: `Ada ${n}`,
          value: '9.0',
          games: 3,
          teams: 'Owls',
          tied,
        },
        rows: [
          row(1, `Ada ${n}`, '9.0'),
          tied ? row(1, `Ben ${n}`, '9.0') : row(2, `Ben ${n}`, '7.0'),
          row(3, `Cy ${n}`, '5.0'),
        ],
      };
    }),
    playerColumns: [{ key: 'player', label: 'Player' }],
    playerRows: [{ id: 'p1', cells: { player: 'Ada 0' } }],
    teamColumns: [{ key: 'team', label: 'Team' }],
    teamRows: [],
    totalsOnlyTeams: [],
  });
  // The lists of the page, in order: each one's title, whether it follows a card, and the
  // place its first line shows.
  const listsOf = (text: string) =>
    [
      ...text.matchAll(
        /<article class="ui-leader-card"( data-after-leader="true")?><h3[^>]*>([^<]+)<\/h3>.*?<span class="ui-leader-name" dir="auto">(\d+)\. /g,
      ),
    ].map((m) => ({ title: m[2], afterCard: m[1] !== undefined, startsAt: Number(m[3]) }));

  it('with five statistics gives the first three a card and the others a plain list from first place', () => {
    const names = ['Points', 'Rebounds', 'Assists', 'Steals', 'Blocks'];
    const text = html(madeUp(names));
    expect(text.match(/<article class="ui-spot"/g)).toHaveLength(3);
    expect(text.match(/<li class="stats-leader">/g)).toHaveLength(5);
    expect(listsOf(text)).toEqual([
      { title: 'Points', afterCard: true, startsAt: 2 },
      { title: 'Rebounds', afterCard: true, startsAt: 2 },
      { title: 'Assists', afterCard: true, startsAt: 2 },
      { title: 'Steals', afterCard: false, startsAt: 1 },
      { title: 'Blocks', afterCard: false, startsAt: 1 },
    ]);
    // A plain list's title is drawn; it stands alone in its column.
    expect(text).toContain(
      '<li class="stats-leader"><article class="ui-leader-card"><h3>Steals</h3>',
    );
    for (const name of ['Steals', 'Blocks']) expect(text).not.toContain(`${name} leader`);
  });

  it('names no one leader where first place is shared: no card, and the list shows them level', () => {
    const text = html(madeUp(['Points', 'Rebounds', 'Assists', 'Steals'], ['Points']));
    // Points is shared: a plain list from 1, both players at 1, and no "Points leader".
    expect(text).not.toContain('Points leader');
    expect(text).toContain(
      '<li class="stats-leader"><article class="ui-leader-card"><h3>Points</h3>',
    );
    expect(text).toContain('>1. Ada 0<');
    expect(text).toContain('>1. Ben 0<');
    // The three cards go to the next three statistics, the first of them on the main color.
    expect(text.match(/<article class="ui-spot"/g)).toHaveLength(3);
    expect(text).toContain(
      '<article class="ui-spot" data-first="true"><p class="ui-spot-label">Rebounds leader</p>',
    );
    expect(listsOf(text)).toEqual([
      { title: 'Points', afterCard: false, startsAt: 1 },
      { title: 'Rebounds', afterCard: true, startsAt: 2 },
      { title: 'Assists', afterCard: true, startsAt: 2 },
      { title: 'Steals', afterCard: true, startsAt: 2 },
    ]);
  });

  it('says first place is shared when the made-up numbers make it so', async () => {
    const data = await statsFor(adult);
    for (const board of data.leaders) {
      if (board.first === undefined) continue;
      const places = board.rows.map((row) => String(row.cells['player']).split('.')[0]);
      expect(board.first.tied).toBe(places[1] === places[0]);
    }
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
    // One mark for each team in the teams table and one beside each player's team. Since
    // step 2.147 part 2 the mark is the team's small shield, where a chip used to be.
    expect(text.match(/<svg class="ui-emblem" data-size="small"/g)).toHaveLength(
      data.teamRows.length + data.playerRows.length,
    );
    expect(text).not.toContain('ui-team-chip');
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
    ).toBe('73');
    expect(parseBy('total')).toBe('total');
    expect(parseBy('anything')).toBe('average');
  });

  it('names a statistic it has words for, and shows the key of one it has not', () => {
    expect(statLabel('rebounds').short).toBe('REB');
    expect(statLabel('deflections').full).toBe('deflections');
  });
});
