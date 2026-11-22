// The standings and statistics pages' content (step 2.43), on the made-up stand-in data
// and core's own queries: a staff-only team shows totals only to a visitor, leaders follow
// the league's minimum games, and standings carry their footnotes.
import { defaultSeasonRules } from '@srleagues/contracts';
import { defaultNamePolicy, readStandings, type StandingsReadStore } from '@srleagues/core';
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
    expect(text).toContain('Owls');
    expect(text).toContain('Seed');
  });

  // North Valley East (the numbers audit's case 45): Owls and Falcons both 2–1; the Owls won
  // their one game, so they are first despite the worse difference. The note beside the
  // Falcons, second, is true of them (step 2.195: it used to tell them they were "placed
  // above"). West (case 46): Lions, Tigers, Hawks and Bears all 1–1, and the note says what
  // placed each (step 2.198, S-74): the Lions beat the Bears, the only one of the others
  // they played; Tigers and Hawks split, and point difference put the Tigers ahead.
  it('writes one note for each group of level teams, true of every team it is beside', async () => {
    const [season] = await seasonsOf(adult);
    const result = await readStandings(stats.readStoreOf(adult), { seasonId: season?.id ?? '' });
    if (!result.ok) throw new Error('expected standings');
    const [east, west] = buildStandingsViews(result.value);
    // Read as a person reads it: without the invisible joiners that hold a record's dash
    // to its numbers (U+2060; build-standings.test.ts checks the page keeps them).
    const beside = (table: typeof east, team: string) =>
      (table?.rows.find((row) => row.team === team)?.notes ?? []).map((id) =>
        table?.footnotes.find((f) => f.id === id)?.text.replaceAll('⁠', ''),
      );
    expect(east?.rows.map((row) => row.team)).toEqual(['Owls', 'Falcons', 'Herons']);
    const eastNote =
      'Owls and Falcons are level on win percentage (.667). The game between them puts Owls ahead.';
    expect(beside(east, 'Falcons')).toEqual([eastNote]);
    expect(beside(east, 'Owls')).toEqual([eastNote]);
    expect(beside(east, 'Herons')).toEqual([]);
    const westNote =
      'Lions, Tigers, Hawks, and Bears are level on win percentage (.500). In the games among these four: Lions 1–0, Tigers 1–1, Hawks 1–1, Bears 0–1. Tigers and Hawks split their games with each other (1–1). Point difference puts Tigers ahead of Hawks: +3 against -3.';
    for (const team of ['Lions', 'Tigers', 'Hawks', 'Bears']) {
      expect(beside(west, team)).toEqual([westNote]);
    }
    expect(beside(west, 'Otters')).toEqual([]);
    expect(beside(west, 'Badgers')).toEqual([
      'Adjusted by -1 win. Played an ineligible player in round 3.',
    ]);
    const text = renderToStaticMarkup(
      createElement(StandingsTables, { tables: [east, west].flatMap((t) => (t ? [t] : [])) }),
    );
    expect(text).not.toMatch(/placed above/i);
    expect(text).toContain(eastNote);
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
    // The Bears keep their players' numbers for their staff too. They have no numbers
    // recorded, so the page shows no totals for them, and the note names only the team
    // whose totals are there (step 2.147 part 3: the note said totals were shown for both).
    expect(data.totalsOnlyTeams).toEqual(['Bears', 'Owls']);
    expect(text).toContain('Only team totals are shown for Owls.');
    expect(text).not.toContain('shown for Bears');
    // A team with nothing recorded has a dash in each cell, and a word for screen readers.
    const bears = /<span dir="auto">Bears<\/span><\/th>(.*?)<\/tr>/.exec(text)?.[1] ?? '';
    expect(bears.match(/aria-hidden="true">–<\/span>/g)).toHaveLength(data.teamColumns.length - 1);
    expect(bears).toContain('Nothing recorded');
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
    totalsNoteTeams: [],
    openingSort: null,
    tableNotes: [],
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
    // step 2.147 part 2 the mark is the team's small shield, where a chip used to be. Since
    // part 3 a player's row carries that shield a second time, beside the player's name:
    // that one is drawn only on a phone, where the team's own column folds away.
    expect(text.match(/<svg class="ui-emblem" data-size="small"/g)).toHaveLength(
      data.teamRows.length + 2 * data.playerRows.length,
    );
    expect(text.match(/<span class="ui-fold"><svg class="ui-emblem"/g)).toHaveLength(
      data.playerRows.length,
    );
    // Both tables open sorted by points, biggest first, and say so on that heading only.
    expect(data.openingSort).toEqual({ key: 'points', direction: 'descending' });
    expect(text.match(/aria-sort="descending"/g)).toHaveLength(2);
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
    // Each leader's name, without the place ("2. Dana Whitfield").
    const leaders = data.leaders.flatMap((b) =>
      b.rows.map((r) => String(r.cells['player']).replace(/^\d+\. /u, '')),
    );
    const theo = data.playerRows.find((r) => r.cells['player'] === 'Theo Lindqvist');
    expect(theo).toBeDefined();
    expect(leaders.length).toBeGreaterThan(0);
    expect(leaders).not.toContain('Theo Lindqvist');
    expect(html(data)).toContain('at least 3 games');
  });

  // The players' table lists everyone and opens sorted by points, so its first row may be a
  // player with too few games to lead a card (design review M1 of step 2.147 part 3). The
  // rows under the league's own minimum are marked, and one line under the title says so.
  const loadWithMinimum = async (minimumGames: number) => {
    const [season] = await seasonsOf(adult);
    if (season === undefined) throw new Error('no season');
    const data = await loadStatsPage(
      stats.readStoreOf(adult),
      { ...(await stats.settingsOf(adult)), minimumGames },
      { leagueId: adult, seasonId: season.id, by: 'average' },
    );
    if ('code' in data) throw new Error(data.code);
    return data;
  };
  const gamesOf = (row: StatsPageData['playerRows'][number]) => Number(row.cells['games']);

  it("marks the players under the league's own minimum games, and only them", async () => {
    const data = await statsFor(adult);
    expect(data.minimumGames).toBe(3);
    const marked = data.playerRows.filter((row) => row.quiet !== undefined);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThan(data.playerRows.length);
    for (const row of data.playerRows) {
      expect(row.quiet).toEqual(gamesOf(row) < 3 ? { games: 'not ranked yet' } : undefined);
    }
    // The player the table puts first has one game, and is marked; the leader is not.
    const named = (name: string) => data.playerRows.find((row) => row.cells['player'] === name);
    expect(named('Ravi Patel')?.cells['games']).toBe(1);
    expect(named('Ravi Patel')?.quiet).toEqual({ games: 'not ranked yet' });
    expect(named('Dana Whitfield')?.quiet).toBeUndefined();
    // Nobody marked is among the leaders, and nobody among the leaders is marked. By name: a
    // row's key is only its place on the page (T-81, record 070), so the leaders' lists and
    // the players' table share no key.
    const leaders = new Set(
      data.leaders.flatMap((board) =>
        board.rows.map((row) => String(row.cells['player']).replace(/^\d+\. /u, '')),
      ),
    );
    expect(leaders.size).toBeGreaterThan(0);
    expect(marked.filter((row) => leaders.has(String(row.cells['player'])))).toEqual([]);
    const text = html(data);
    expect(text).toContain(
      '<p class="ui-section-note">Every player is listed. Fewer than 3 games: not ranked yet.</p>',
    );
    expect(text.indexOf('Every player is listed.')).toBeGreaterThan(text.indexOf('All players'));
    expect(text.match(/data-quiet="true"/g)).toHaveLength(marked.length);
    expect(text).toContain(
      'data-quiet="true">1<span class="ui-visually-hidden"> not ranked yet</span></td>',
    );
    expect(text).not.toMatch(/<th[^>]*>(Rank|#)</);
  });

  it('follows the minimum the league has, not a fixed three', async () => {
    const two = await loadWithMinimum(2);
    const underTwo = two.playerRows.filter((row) => gamesOf(row) < 2);
    expect(underTwo.length).toBeGreaterThan(0);
    expect(two.playerRows.filter((row) => row.quiet !== undefined)).toEqual(underTwo);
    // Someone with two games is marked under a minimum of three and not under one of two.
    expect(two.playerRows.some((row) => gamesOf(row) === 2 && row.quiet === undefined)).toBe(true);
    expect(html(two)).toContain('Fewer than 2 games: not ranked yet.');
    expect(html(two)).not.toContain('Fewer than 3');
    // A league with no minimum ranks everyone: no row is marked and the line is not drawn.
    const none = await loadWithMinimum(0);
    expect(none.playerRows.every((row) => row.quiet === undefined)).toBe(true);
    expect(html(none)).not.toContain('not ranked yet');
    expect(html(none)).not.toContain('Every player is listed');
    // And a minimum nobody is under draws no line either.
    const one = await loadWithMinimum(1);
    expect(one.playerRows.every((row) => row.quiet === undefined)).toBe(true);
    expect(html(one)).not.toContain('Every player is listed');
  });

  it("holds no person's id in its data or its HTML, in either league (T-81, record 070)", async () => {
    for (const leagueId of [adult, youth]) {
      const [season] = await seasonsOf(leagueId);
      const totals = await stats.readStoreOf(leagueId).playerTotals(season?.id ?? '');
      const ids = totals.map((row) => row.personId.toLowerCase());
      expect(ids.length).toBeGreaterThan(0);
      for (const by of ['average', 'total'] as const) {
        const data = await statsFor(leagueId, by);
        expect(data.playerRows.length).toBeGreaterThan(0);
        const sent = `${JSON.stringify(data)}\n${html(data)}`.toLowerCase();
        expect(ids.filter((id) => sent.includes(id))).toEqual([]);
        // The rows' keys are their places on this page.
        expect(data.playerRows.map((row) => row.id)).toEqual(
          data.playerRows.map((_, place) => `player-${place}`),
        );
      }
    }
  });

  it('keeps the points card while fouls has none (S-48)', async () => {
    const data = await statsFor(adult);
    expect(data.playerColumns.map((c) => c.key)).toContain('fouls');
    expect(data.leaders.map((board) => board.key)).not.toContain('fouls');
    expect(data.leaders.map((board) => board.key)).not.toContain('turnovers');
    expect(data.leaders.map((board) => board.key)).toContain('points');
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

  // The first test's walk (the numbers audit's case 8): game 1, Wolves at Ravens, scored
  // live, 7 to 6; game 2 typed in as a final score only, 50 to 45 for the Wolves. The
  // standings count both games (Ravens 52 points in 2); the statistics count game 1 only,
  // and now say so: Ravens 7.0 points a game, from 1 game (step 2.195).
  it("says which games the statistics count, and each team's number of them (the walk)", async () => {
    const ravens = 'ravens';
    const wolves = 'wolves';
    const season = '01900000-0000-7000-8000-0000000000e1';
    const entry = (total: number) => ({ total, gamesRecorded: 1 });
    const players = [
      ['r1', ravens, 'Rae', { points: 2 }],
      ['r4', ravens, 'Rio', { points: 2 }],
      ['r5', ravens, 'Ros', { points: 1, fg1: 1 }],
      ['r6', ravens, 'Rue', { points: 2 }],
      ['w1', wolves, 'Wes', { points: 3, fg3: 1, fouls: 1 }],
      ['w2', wolves, 'Wyn', { points: 1, fg1: 1 }],
      ['w3', wolves, 'Wil', { points: 2 }],
    ] as const;
    const store: StandingsReadStore = {
      findSeason: async (id) =>
        id === season ? { id, name: 'Walk', rules: defaultSeasonRules() } : undefined,
      seasonStatKeys: async () => [],
      teams: async () =>
        [ravens, wolves].map((id) => ({
          id,
          name: id === ravens ? 'Ravens' : 'Wolves',
          slug: id,
          color: null,
          divisionId: null,
          statsVisibility: 'everyone',
          removed: false,
        })),
      divisions: async () => [],
      standingsRows: async () => [],
      adjustments: async () => [],
      playerTotals: async () =>
        players.map(([personId, , , stats]) => ({
          personId,
          gamesPlayed: 1,
          secondsPlayed: 0,
          secondsGames: 1,
          stats: {
            version: 1,
            stats: Object.fromEntries(
              ['points', 'fg3', 'fg1', 'fouls'].map((key) => [
                key,
                entry((stats as Readonly<Record<string, number>>)[key] ?? 0),
              ]),
            ),
          },
        })),
      playerTeams: async () => players.map(([personId, teamId]) => ({ personId, teamId })),
      decidedGamesOf: async () => [],
      decidedGames: async () => [],
      // Summed from game 1's lines: the typed game 2 has none.
      teamStatTotals: async () => [
        { teamId: ravens, statKey: 'points', ...entry(7) },
        { teamId: ravens, statKey: 'fg3', ...entry(0) },
        { teamId: ravens, statKey: 'fg1', ...entry(1) },
        { teamId: ravens, statKey: 'fouls', ...entry(1) },
        { teamId: wolves, statKey: 'points', ...entry(6) },
        { teamId: wolves, statKey: 'fg3', ...entry(1) },
        { teamId: wolves, statKey: 'fg1', ...entry(1) },
        { teamId: wolves, statKey: 'fouls', ...entry(1) },
      ],
      teamTurnoverGames: async () => [],
      people: async (ids) =>
        ids.map((id) => ({
          id,
          firstName: players.find(([personId]) => personId === id)?.[2] ?? '',
          lastName: 'Made-up',
          isMinor: false,
          visibility: 'none',
        })),
    };
    const data = await loadStatsPage(
      store,
      { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames: 3 },
      { leagueId: adult, seasonId: season, by: 'average' },
    );
    if ('code' in data) throw new Error(data.code);
    const row = data.teamRows.find((r) => r.cells['team'] === 'Ravens');
    expect(row?.cells['points']).toBe('7.0');
    expect(row?.cells['games']).toBe(1);
    expect(data.teamRows.find((r) => r.cells['team'] === 'Wolves')?.cells['games']).toBe(1);
    // The column comes right after the team, short on the page and named in full for
    // screen readers.
    expect(data.teamColumns.slice(0, 2)).toEqual([
      { key: 'team', label: 'Team' },
      { key: 'games', label: 'GP', fullName: 'Games with statistics', numeric: true },
    ]);
    const text = html(data);
    expect(text).toContain(
      '</section><p class="ui-section-note">Statistics count the games that were scored live or entered as a box score. A game with only a final score counts in the standings, not here.</p><div class="stats-tables"',
    );
    // Once, above both tables, before the players' table (the lead's review, item 7).
    expect(text.match(/Statistics count the games/g)).toHaveLength(1);
    expect(text.indexOf('Statistics count the games')).toBeLessThan(
      text.indexOf('<h2>All players</h2>'),
    );
    // Every statistic here was kept in the one game each team has numbers from.
    expect(text).not.toContain('averaged over the games where it was');
    // Each team's totals are its players' numbers added up: nothing to say (step 2.196).
    const teamsCountMore = "A team's totals count what was charged to the team";
    expect(data.tableNotes.join(' ')).not.toContain(teamsCountMore);
    const notesWith = async (over: Partial<StandingsReadStore>) => {
      const read = await loadStatsPage(
        { ...store, ...over },
        { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames: 3 },
        { leagueId: adult, seasonId: season, by: 'average' },
      );
      if ('code' in read) throw new Error(read.code);
      return read.tableNotes;
    };
    // A turnover charged to the Ravens, in a season that keeps no turnovers: no column
    // shows it, so still nothing to say.
    expect(
      (
        await notesWith({
          teamTurnoverGames: async () => [
            { gameId: 'g1', teamId: ravens, turnovers: 1, countedByLines: true },
          ],
        })
      ).join(' '),
    ).not.toContain(teamsCountMore);
    // The Ravens' points a final score entered as 9 where their players add to 7: said
    // once, after the page's other sentences.
    const typed = await notesWith({
      teamStatTotals: async (id) =>
        (await store.teamStatTotals(id)).map((row) =>
          row.teamId === ravens && row.statKey === 'points'
            ? { ...row, total: 9, linesTotal: 7 }
            : row,
        ),
    });
    expect(typed.at(-1)).toBe(
      "A team's totals count what was charged to the team and the final scores as entered, so they can differ from what its players' numbers add up to.",
    );
    expect(typed.filter((note) => note.startsWith(teamsCountMore))).toHaveLength(1);
    expect(text).toContain('<span class="ui-visually-hidden">Games with statistics</span>');
    // Season totals carry the same count: the totals are over the same one game.
    const totals = await loadStatsPage(
      store,
      { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames: 3 },
      { leagueId: adult, seasonId: season, by: 'total' },
    );
    if ('code' in totals) throw new Error(totals.code);
    expect(totals.teamRows.find((r) => r.cells['team'] === 'Ravens')?.cells).toMatchObject({
      games: 1,
      points: '7',
    });
  });

  it('keeps the note about staff-only teams under the teams’ title, alone', async () => {
    const text = html(await statsFor(adult));
    expect(text).toContain(
      '<h2>Teams</h2></div><p class="ui-section-note">Only team totals are shown for Owls.</p>',
    );
  });

  it('names a statistic it has words for, and shows the key of one it has not', () => {
    expect(statLabel('rebounds').short).toBe('REB');
    expect(statLabel('deflections').full).toBe('deflections');
  });
});
