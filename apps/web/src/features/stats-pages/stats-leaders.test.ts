// The statistics page's leaders as a parent reads them (step 2.199; the numbers audit's
// M3, L1 and L2, cases 36, 37, 39, 40 and 41): the words and numbers of the drawn page,
// from a made-up season's stored totals read through core's own queries. Who is ranked,
// and in which place, is core's (read-stat-leaders.test.ts): here, what the page writes.
import { defaultNamePolicy, type StandingsReadStore } from '@srleagues/core';
import { defaultSeasonRules } from '@srleagues/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadHomeLeaders } from './build-home-leaders.ts';
import { loadStatsPage, type StatsPageData } from './build-stats.ts';
import { StatsTables } from './stats-page.tsx';

const leagueId = '01900000-0000-7000-8000-000000000001';
const seasonId = '01900000-0000-7000-8000-0000000000c1';
const ash = '01900000-0000-7000-8000-0000000a0001';
const birch = '01900000-0000-7000-8000-0000000a0002';
const staff = '01900000-0000-7000-8000-0000000a0003';

/** A player's stored season totals: each statistic's total and the games it was kept in. */
type Player = {
  readonly name: string;
  /** The teams the player played for, as the stored totals name them. */
  readonly played: readonly string[];
  /** Roster places with no line: a team the player left before its first game. */
  readonly rosterOnly?: readonly string[];
  readonly games: number;
  readonly stats: Readonly<Record<string, readonly [total: number, gamesRecorded: number]>>;
};

const personOf = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** A season of Ash and Birch, open to everyone, and a team whose numbers are staff only. */
function season(players: readonly Player[]): StandingsReadStore {
  const people = players.map((player, n) => ({ ...player, id: personOf(n + 1) }));
  const team = (id: string, name: string, statsVisibility: string) => ({
    id,
    name,
    slug: name.toLowerCase(),
    color: null,
    divisionId: null,
    statsVisibility,
    removed: false,
  });
  return {
    findSeason: async (id) =>
      id === seasonId ? { id, name: 'Fall', rules: defaultSeasonRules() } : undefined,
    seasonStatKeys: async (id) => (id === seasonId ? ['points', 'fg3', 'fouls'] : undefined),
    teams: async () => [
      team(ash, 'Ash', 'everyone'),
      team(birch, 'Birch', 'everyone'),
      team(staff, 'Staff', 'staff'),
    ],
    divisions: async () => [],
    standingsRows: async () => [],
    adjustments: async () => [],
    playerTotals: async () =>
      people.map((p) => ({
        personId: p.id,
        gamesPlayed: p.games,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: {
          version: 1,
          teamIds: [...p.played].sort(),
          stats: Object.fromEntries(
            Object.entries(p.stats).map(([key, [total, gamesRecorded]]) => [
              key,
              { total, gamesRecorded },
            ]),
          ),
        },
      })),
    playerTeams: async () =>
      people.flatMap((p) =>
        [...new Set([...p.played, ...(p.rosterOnly ?? [])])]
          .sort()
          .map((teamId) => ({ personId: p.id, teamId })),
      ),
    decidedGamesOf: async () => [],
    decidedGames: async () => [],
    teamStatTotals: async () => [],
    teamTurnoverGames: async () => [],
    people: async (ids) =>
      ids.flatMap((id) => {
        const p = people.find((person) => person.id === id);
        return p === undefined
          ? []
          : [{ id, firstName: p.name, lastName: 'Player', isMinor: false, visibility: 'none' }];
      }),
  };
}

async function page(
  players: readonly Player[],
  minimumGames = 0,
  by: 'average' | 'total' = 'average',
): Promise<{ readonly data: StatsPageData; readonly text: string }> {
  const data = await loadStatsPage(
    season(players),
    { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames },
    { leagueId, seasonId, by },
  );
  if ('code' in data) throw new Error(data.code);
  return { data, text: renderToStaticMarkup(createElement(StatsTables, { data })) };
}

/** A board as the page writes it: each line's place and name, detail and number. */
const linesOf = (data: StatsPageData, key: string) =>
  (data.leaders.find((board) => board.key === key)?.rows ?? []).map((row) => [
    row.cells['player'],
    row.cells['team'],
    row.cells['games'],
    row.cells['value'],
  ]);

const points = (total: number, games: number): Player['stats'] => ({ points: [total, games] });

describe('two numbers that would read the same are written apart (case 39)', () => {
  it('writes 22 in 3 as 7.33 and 29 in 4 as 7.25, on the card and in the list', async () => {
    const { data, text } = await page([
      { name: 'Ada', played: [ash], games: 3, stats: points(22, 3) },
      { name: 'Ben', played: [birch], games: 4, stats: points(29, 4) },
      { name: 'Cy', played: [ash], games: 4, stats: points(20, 4) },
    ]);
    expect(linesOf(data, 'points')).toEqual([
      ['1. Ada Player', 'Ash', 3, '7.33'],
      ['2. Ben Player', 'Birch', 4, '7.25'],
      ['3. Cy Player', 'Ash', 4, '5.0'],
    ]);
    expect(data.leaders[0]?.first).toMatchObject({
      name: 'Ada Player',
      value: '7.33',
      tied: false,
    });
    expect(text).toContain('<p class="ui-spot-label">Points leader</p>');
    expect(text).toMatch(/>7\.33<.*Ada Player/su);
    expect(text).toContain('>2. Ben Player<');
    expect(text).toMatch(/2\. Ben Player.*?>7\.25</su);
    // Not "7.3" twice on the board. The full table below gives no places, and keeps its
    // one decimal.
    const board = text.slice(0, text.indexOf('<div class="stats-tables"'));
    expect(board).not.toMatch(/>7\.3</u);
    expect(text.slice(board.length)).toMatch(/>7\.3</u);
  });

  it('adds as many decimals as tell them apart, and none to level players', async () => {
    // 37 in 3 is 12.333…, 6167 in 500 is 12.334: they read 12.3 and 12.33 alike, and
    // apart only at 12.333 and 12.334. Two players level on 6.0 read the same and share a
    // place.
    const { data } = await page([
      { name: 'Ada', played: [ash], games: 500, stats: points(6167, 500) },
      { name: 'Ben', played: [birch], games: 3, stats: points(37, 3) },
      { name: 'Cy', played: [ash], games: 2, stats: points(12, 2) },
      { name: 'Dee', played: [birch], games: 3, stats: points(18, 3) },
    ]);
    expect(linesOf(data, 'points').map((line) => [line[0], line[3]])).toEqual([
      ['1. Ada Player', '12.334'],
      ['2. Ben Player', '12.333'],
      ['3. Cy Player', '6.0'],
      ['3. Dee Player', '6.0'],
    ]);
  });

  it('writes every player of one place with the same number (the review, M1)', async () => {
    const level = await page([
      { name: 'Ada', played: [ash], games: 3, stats: points(22, 3) },
      { name: 'Ben', played: [birch], games: 4, stats: points(29, 4) },
      { name: 'Cy', played: [ash], games: 4, stats: points(29, 4) },
    ]);
    expect(linesOf(level.data, 'points').map((line) => [line[0], line[3]])).toEqual([
      ['1. Ada Player', '7.33'],
      ['2. Ben Player', '7.25'],
      ['2. Cy Player', '7.25'],
    ]);
    const reverse = await page([
      { name: 'Ada', played: [ash], games: 3, stats: points(22, 3) },
      { name: 'Ben', played: [birch], games: 3, stats: points(22, 3) },
      { name: 'Cy', played: [ash], games: 4, stats: points(29, 4) },
    ]);
    expect(linesOf(reverse.data, 'points').map((line) => [line[0], line[3]])).toEqual([
      ['1. Ada Player', '7.33'],
      ['1. Ben Player', '7.33'],
      ['3. Cy Player', '7.25'],
    ]);
  });

  it('gives no number a decimal because of a player this visitor does not see (S-22)', async () => {
    // A staff-only team's player at 7.25 stands between 7.33 and 7.0: the visitor's board
    // is 7.3 and 7.0, as if the player were not there.
    const { data, text } = await page([
      { name: 'Ada', played: [ash], games: 3, stats: points(22, 3) },
      { name: 'Hid', played: [staff], games: 4, stats: points(29, 4) },
      { name: 'Cy', played: [birch], games: 3, stats: points(21, 3) },
    ]);
    expect(linesOf(data, 'points')).toEqual([
      ['1. Ada Player', 'Ash', 3, '7.3'],
      ['2. Cy Player', 'Birch', 3, '7.0'],
    ]);
    expect(text).not.toContain('Hid');
    expect(text).not.toContain('7.25');
  });

  it('writes season totals as whole numbers, which never read the same unless level', async () => {
    const { data } = await page(
      [
        { name: 'Ada', played: [ash], games: 3, stats: points(22, 3) },
        { name: 'Ben', played: [birch], games: 4, stats: points(29, 4) },
      ],
      0,
      'total',
    );
    expect(linesOf(data, 'points').map((line) => line[3])).toEqual(['29', '22']);
  });
});

describe('a board says the games its numbers are over (case 41, S-63)', () => {
  // Ada's 3-pointers were kept in 1 of her 2 games: 2 made, 2.0 a game over that one.
  const players: Player[] = [
    {
      name: 'Ada',
      played: [ash],
      games: 2,
      stats: { points: [10, 2], fg3: [2, 1], fouls: [1, 2] },
    },
    { name: 'Ben', played: [birch], games: 2, stats: { points: [6, 2], fg3: [1, 2] } },
  ];

  it('writes "1 game" beside an average over one game, though the player played two', async () => {
    const { data, text } = await page(players);
    expect(linesOf(data, 'fg3')).toEqual([
      ['1. Ada Player', 'Ash', 1, '2.0'],
      ['2. Ben Player', 'Birch', 2, '0.5'],
    ]);
    expect(data.leaders.find((b) => b.key === 'fg3')?.first).toMatchObject({
      value: '2.0',
      games: 1,
    });
    expect(text).toMatch(/>2\.0<.*?Ada Player.*?Ash · 1 game</su);
    // The full table still says she played two games.
    expect(data.playerRows.find((r) => r.cells['player'] === 'Ada Player')?.cells['games']).toBe(2);
  });

  it('under a minimum of two leaves her off the 3-pointers board and on the points board', async () => {
    const { data, text } = await page(players, 2);
    expect(linesOf(data, 'fg3')).toEqual([['1. Ben Player', 'Birch', 2, '0.5']]);
    expect(linesOf(data, 'points').map((line) => [line[0], line[2]])).toEqual([
      ['1. Ada Player', 2],
      ['2. Ben Player', 2],
    ]);
    expect(text).toContain(
      'To be ranked in a statistic, a player needs it recorded in at least 2 games.',
    );
    // Neither player is under two games played: no row of the full table is marked.
    expect(data.playerRows.every((row) => row.quiet === undefined)).toBe(true);
  });

  it('says why the top of the table is on no board: points recorded in 1 of 3 games (L2)', async () => {
    const { data, text } = await page(
      [
        { name: 'Ada', played: [ash], games: 3, stats: { points: [40, 1] } },
        { name: 'Ben', played: [birch], games: 3, stats: points(30, 3) },
      ],
      3,
    );
    expect(linesOf(data, 'points').map((line) => line[0])).toEqual(['1. Ben Player']);
    expect(data.recordedInFewer).toBe(true);
    expect(text).toContain(
      '<p class="ui-section-note">A statistic recorded in fewer than 3 games is not ranked yet, so a column may be topped by a player on no leaders board.</p>',
    );
    const even = await page([{ name: 'Ben', played: [birch], games: 3, stats: points(30, 3) }], 3);
    expect(even.data.recordedInFewer).toBe(false);
    expect(even.text).not.toContain('is not ranked yet');
  });
});

describe('everyone level with the last place shown is shown', () => {
  it('lists both players level in fifth, at 5, and nobody behind them', async () => {
    const values = [50, 40, 30, 20, 10, 10, 5];
    const { data, text } = await page(
      values.map((value, n) => ({
        name: `P${String(n + 1)}`,
        played: [n % 2 === 0 ? ash : birch],
        games: 1,
        stats: points(value, 1),
      })),
      0,
      'total',
    );
    expect(linesOf(data, 'points').map((line) => [line[0], line[3]])).toEqual([
      ['1. P1 Player', '50'],
      ['2. P2 Player', '40'],
      ['3. P3 Player', '30'],
      ['4. P4 Player', '20'],
      ['5. P5 Player', '10'],
      ['5. P6 Player', '10'],
    ]);
    // P1 is on the card; the list goes on from second place, to both fifths.
    expect(text).toContain('>5. P5 Player<');
    expect(text).toContain('>5. P6 Player<');
    expect(text).not.toContain('. P7 Player<');
  });
});

describe('nobody leads with nothing (cases 37 and 40)', () => {
  it('draws no 3-pointers board, and no card, when every player shown made none', async () => {
    // Case 37: the open teams' players made no 3-pointers; the staff-only team's did.
    const { data, text } = await page([
      { name: 'Ada', played: [ash], games: 1, stats: { points: [10, 1], fg3: [0, 1] } },
      { name: 'Ben', played: [birch], games: 1, stats: { points: [8, 1], fg3: [0, 1] } },
      { name: 'Sam', played: [staff], games: 1, stats: { points: [9, 1], fg3: [3, 1] } },
    ]);
    expect(linesOf(data, 'fg3')).toEqual([]);
    expect(data.leaders.find((b) => b.key === 'fg3')?.first).toBeUndefined();
    expect(text).not.toContain('3-pointers leader');
    expect(text).not.toMatch(/>1\. \w+ Player<\/span>.*?>0\.0</su);
    // The points board is there, and so are the 3-pointers in the full table.
    expect(text).toContain('Points leader');
    expect(data.playerColumns.map((c) => c.key)).toContain('fg3');
  });

  it('lists nobody at 0 below a leader (case 40)', async () => {
    const { data } = await page([
      { name: 'Ada', played: [ash], games: 1, stats: { points: [10, 1], fg3: [1, 1] } },
      { name: 'Ben', played: [ash], games: 1, stats: { points: [8, 1], fg3: [0, 1] } },
      { name: 'Cy', played: [birch], games: 1, stats: { points: [0, 1], fg3: [0, 1] } },
    ]);
    expect(linesOf(data, 'fg3').map((line) => line[0])).toEqual(['1. Ada Player']);
    expect(linesOf(data, 'points').map((line) => line[0])).toEqual([
      '1. Ada Player',
      '2. Ben Player',
    ]);
  });
});

describe('the Team column names the teams a player has numbers with (case 36)', () => {
  it('names Birch only for a player who left Ash before its first game', async () => {
    const { data, text } = await page([
      { name: 'Ada', played: [ash, birch], games: 2, stats: points(30, 2) },
      { name: 'Ben', played: [birch], rosterOnly: [ash], games: 1, stats: points(5, 1) },
    ]);
    expect(linesOf(data, 'points')).toEqual([
      ['1. Ada Player', 'Ash, Birch', 2, '15.0'],
      ['2. Ben Player', 'Birch', 1, '5.0'],
    ]);
    const ben = data.playerRows.find((row) => row.cells['player'] === 'Ben Player');
    expect(ben?.cells['team']).toBe('Birch');
    expect(ben?.severalTeams).toBeUndefined();
    expect(text).toContain('Birch · 1 game');
    expect(text).not.toContain('Ash, Birch · 1 game');
  });
});

describe("the home page's leaders write what the statistics page writes", () => {
  it('7.33 and 7.25 for case 39, each with the games its average is over', async () => {
    const home = await loadHomeLeaders(
      season([
        { name: 'Ada', played: [ash], games: 4, stats: { points: [22, 3] } },
        { name: 'Ben', played: [birch], games: 4, stats: points(29, 4) },
      ]),
      { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames: 0 },
      { leagueId, seasonId },
    );
    expect(home.map((leader) => [leader.label, leader.name, leader.value, leader.detail])).toEqual([
      ['01 / Points', 'Ada Player', '7.33', 'Ash · 3 games'],
      ['02 / Points', 'Ben Player', '7.25', 'Birch · 4 games'],
    ]);
  });

  it('brings everyone level with the third place, not the three with the lowest ids (M2)', async () => {
    const home = await loadHomeLeaders(
      season([
        { name: 'Ada', played: [ash], games: 3, stats: points(50, 3) },
        { name: 'Ben', played: [birch], games: 3, stats: points(40, 3) },
        { name: 'Cy', played: [ash], games: 3, stats: points(30, 3) },
        { name: 'Dee', played: [birch], games: 3, stats: points(30, 3) },
      ]),
      { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames: 0 },
      { leagueId, seasonId },
    );
    expect(home.map((leader) => [leader.label, leader.name, leader.value])).toEqual([
      ['01 / Points', 'Ada Player', '16.7'],
      ['02 / Points', 'Ben Player', '13.3'],
      ['03 / Points', 'Cy Player', '10.0'],
      ['03 / Points', 'Dee Player', '10.0'],
    ]);
  });
});
