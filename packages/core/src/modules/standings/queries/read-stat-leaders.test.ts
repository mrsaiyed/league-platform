// Leaders nobody can argue with (step 2.199; the numbers audit's M3, L1 and L2, cases 36,
// 37, 39, 40 and 41). Each case is a made-up season of box score lines: the stored totals
// are worked out from those lines by the sports engine, as the database's are, so a test
// never hand-writes a total that the lines could not give. S-22 holds for each rule: a
// player whose numbers the viewer may not see changes no rank and no count they see.
import { defaultSeasonRules } from '@srleagues/contracts';
import { seasonTotals } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, publicViewer, type Viewer } from '../../people/index.ts';
import {
  divisionId,
  leagueId,
  openTeam,
  seasonId,
  staffTeam,
} from '../memory-standings-read.test-helper.ts';
import type { DecidedGameLines, StandingsReadStore } from '../read-ports.ts';
import type { StatisticsViewing } from '../statistics-source.ts';
import { readStatLeaders } from './read-stat-leaders.ts';
import { readStatisticsTable } from './read-statistics-table.ts';

const viewing = (viewer: Viewer): StatisticsViewing => ({
  leagueId,
  viewer,
  audience: 'adult',
  policy: defaultNamePolicy,
});
const visitor = viewing(publicViewer(leagueId));
const coach = viewing({ leagueId, leagueAdmin: false, staffOfTeamIds: [staffTeam] });
const admin = viewing({ leagueId, leagueAdmin: true, staffOfTeamIds: [] });

/** A third team, open to everyone: case 36's "Birch". The open team is its "Ash". */
const birch = '01900000-0000-7000-8000-0000000a0003';

/** One box score line: a player's numbers for a team in a game. */
type Line = {
  readonly game: string;
  readonly team: string;
  readonly stats: Record<string, number>;
};
type Player = {
  readonly name: string;
  readonly lines: readonly Line[];
  /** Roster places with no line, such as a team the player left before its first game. */
  readonly rosterOnly?: readonly string[];
};

const personOf = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

/**
 * A season of these players' lines on the open team, the staff-only team and Birch, with
 * every line a final box score game's. The stored totals are the engine's, as the
 * database's are (its document names the teams each player played for).
 */
function season(players: readonly Player[]): StandingsReadStore {
  const people = players.map((player, n) => ({ ...player, id: personOf(n + 1) }));
  const byGame = new Map<string, DecidedGameLines['lines'][number][]>();
  for (const person of people) {
    for (const line of person.lines) {
      byGame.set(line.game, [
        ...(byGame.get(line.game) ?? []),
        {
          teamId: line.team,
          personId: person.id,
          played: true,
          secondsPlayed: null,
          stats: line.stats,
        },
      ]);
    }
  }
  const games: DecidedGameLines[] = [...byGame.entries()].map(([gameId, lines]) => {
    const sides = [...new Set(lines.map((line) => line.teamId))];
    return {
      gameId,
      status: 'final',
      captureMode: 'box',
      homeTeamId: sides[0] ?? openTeam,
      awayTeamId: sides[1] ?? birch,
      lines,
    };
  });
  const totals = seasonTotals(
    games.map((game) => ({ ...game, status: 'final' as const, captureMode: 'box' as const })),
  );
  const team = (id: string, name: string, statsVisibility: string) => ({
    id,
    name,
    slug: name.toLowerCase(),
    color: null,
    divisionId,
    statsVisibility,
    removed: false,
  });
  return {
    findSeason: async (id) =>
      id === seasonId ? { id, name: 'Fall', rules: defaultSeasonRules() } : undefined,
    seasonStatKeys: async (id) => (id === seasonId ? ['points', 'fg3', 'fouls'] : undefined),
    teams: async () => [
      team(openTeam, 'Ash', 'everyone'),
      team(staffTeam, 'Staff', 'staff'),
      team(birch, 'Birch', 'everyone'),
    ],
    divisions: async () => [{ id: divisionId, name: 'North', color: null, sort: 0 }],
    standingsRows: async () => [],
    adjustments: async () => [],
    playerTotals: async () =>
      totals.map((t) => ({
        personId: t.personId,
        gamesPlayed: t.gamesPlayed,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: {
          version: 1,
          teamIds: t.teamIds,
          stats: Object.fromEntries(
            Object.entries(t.stats).map(([key, s]) => [
              key,
              { total: s.total, gamesRecorded: s.gamesRecorded },
            ]),
          ),
        },
      })),
    // Every team a person has a line or a roster place with (list-player-team-links.ts).
    playerTeams: async () =>
      people
        .flatMap((person) =>
          [...new Set([...person.lines.map((l) => l.team), ...(person.rosterOnly ?? [])])].map(
            (teamId) => ({ personId: person.id, teamId }),
          ),
        )
        .sort((a, b) => (a.personId + a.teamId).localeCompare(b.personId + b.teamId)),
    decidedGamesOf: async (_season, personIds) =>
      games.map((game) => ({
        ...game,
        lines: game.lines.filter((line) => personIds.includes(line.personId)),
      })),
    decidedGames: async () => games,
    teamStatTotals: async () => [],
    teamTurnoverGames: async () => [],
    people: async (ids) =>
      ids.flatMap((id) => {
        const person = people.find((p) => p.id === id);
        return person === undefined
          ? []
          : [
              {
                id,
                firstName: person.name,
                lastName: 'Player',
                isMinor: false,
                visibility: 'none',
              },
            ];
      }),
  };
}

type Board = {
  readonly measure?: string;
  readonly by?: 'total' | 'average';
  readonly minimumGames?: number;
  readonly limit?: number;
};

/** A board as names, ranks, values and the games the value is over. */
async function board(store: StandingsReadStore, who: StatisticsViewing, ask: Board = {}) {
  const result = await readStatLeaders(
    store,
    {
      seasonId,
      measure: ask.measure ?? 'points',
      by: ask.by ?? 'average',
      minimumGames: ask.minimumGames ?? 0,
      ...(ask.limit === undefined ? {} : { limit: ask.limit }),
    },
    who,
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.value.leaders.map((l) => ({
    name: l.name.text,
    rank: l.rank,
    value: l.value,
    games: l.gamesRecorded,
    teamIds: l.teamIds,
  }));
}

const points = (game: string, team: string, value: number, more: Record<string, number> = {}) => ({
  game,
  team,
  stats: { points: value, ...more },
});

describe('the minimum counts the games the statistic was kept in (S-63; case 41)', () => {
  // Case 41: two 3-pointers in game 1; 3-pointers not kept in game 2. Fouls 0 and 1.
  const store = season([
    {
      name: 'Ada',
      lines: [
        points('g1', openTeam, 6, { fg3: 2, fouls: 0 }),
        points('g2', openTeam, 4, { fouls: 1 }),
      ],
    },
    {
      name: 'Ben',
      lines: [points('g1', birch, 3, { fg3: 1 }), points('g2', birch, 2, { fg3: 0 })],
    },
  ]);

  it('averages 3-pointers over the one game they were kept in, and says that game', async () => {
    expect(await board(store, visitor, { measure: 'fg3' })).toEqual([
      { name: 'Ada Player', rank: 1, value: 2, games: 1, teamIds: [openTeam] },
      { name: 'Ben Player', rank: 2, value: 0.5, games: 2, teamIds: [birch] },
    ]);
  });

  it('does not rank a 3-pointers average over one game under a minimum of two', async () => {
    // Ada played two games, but her 3-pointers are an average over one: she is left off
    // that board, and stays on the points board, kept in both her games.
    expect(await board(store, visitor, { measure: 'fg3', minimumGames: 2 })).toEqual([
      { name: 'Ben Player', rank: 1, value: 0.5, games: 2, teamIds: [birch] },
    ]);
    expect(
      (await board(store, visitor, { minimumGames: 2 })).map((l) => [l.name, l.games]),
    ).toEqual([
      ['Ada Player', 2],
      ['Ben Player', 2],
    ]);
  });

  it("counts a public team's games only, for a player who also played for a staff-only team (S-22)", async () => {
    // Cy scored in one game for the open team and two for the staff-only team: a visitor
    // sees one game of points, so under a minimum of two Cy is not ranked; the staff-only
    // team's coach sees all three games, and Cy first.
    const mixed = season([
      {
        name: 'Cy',
        lines: [
          points('g1', openTeam, 9),
          points('g2', staffTeam, 30),
          points('g3', staffTeam, 30),
        ],
      },
      { name: 'Dee', lines: [points('g1', birch, 8), points('g4', birch, 8)] },
    ]);
    expect(await board(mixed, visitor, { minimumGames: 2 })).toEqual([
      { name: 'Dee Player', rank: 1, value: 8, games: 2, teamIds: [birch] },
    ]);
    expect(await board(mixed, visitor)).toEqual([
      { name: 'Cy Player', rank: 1, value: 9, games: 1, teamIds: [openTeam] },
      { name: 'Dee Player', rank: 2, value: 8, games: 2, teamIds: [birch] },
    ]);
    expect((await board(mixed, coach, { minimumGames: 2 })).map((l) => [l.name, l.games])).toEqual([
      ['Cy Player', 3],
      ['Dee Player', 2],
    ]);
  });
});

describe('averages that read the same are ranked by what they are (case 39)', () => {
  it('puts 22 in 3 (7.33) ahead of 29 in 4 (7.25), on places of their own', async () => {
    const store = season([
      {
        name: 'Ada',
        lines: [points('g1', openTeam, 7), points('g2', openTeam, 7), points('g3', openTeam, 8)],
      },
      {
        name: 'Ben',
        lines: [
          points('g1', birch, 7),
          points('g2', birch, 7),
          points('g3', birch, 7),
          points('g4', birch, 8),
        ],
      },
    ]);
    expect(await board(store, visitor)).toEqual([
      { name: 'Ada Player', rank: 1, value: 22 / 3, games: 3, teamIds: [openTeam] },
      { name: 'Ben Player', rank: 2, value: 29 / 4, games: 4, teamIds: [birch] },
    ]);
  });
});

describe('everyone level with the last place shown is shown', () => {
  // Six players, two of them level in fifth place, and a seventh behind them.
  const six = [50, 40, 30, 20, 10, 10, 5].map((value, n) => ({
    name: `P${String(n + 1)}`,
    lines: [points('g1', n % 2 === 0 ? openTeam : birch, value)],
  }));

  it('lists both players level in fifth on a board of five places, and nobody behind them', async () => {
    const rows = await board(season(six), visitor, { by: 'total', limit: 5 });
    expect(rows.map((l) => [l.name, l.rank, l.value])).toEqual([
      ['P1 Player', 1, 50],
      ['P2 Player', 2, 40],
      ['P3 Player', 3, 30],
      ['P4 Player', 4, 20],
      ['P5 Player', 5, 10],
      ['P6 Player', 5, 10],
    ]);
  });

  it('cuts at five places when the fifth is not shared', async () => {
    const rows = await board(season(six.filter((p) => p.name !== 'P6')), visitor, {
      by: 'total',
      limit: 5,
    });
    expect(rows.map((l) => [l.name, l.rank])).toEqual([
      ['P1 Player', 1],
      ['P2 Player', 2],
      ['P3 Player', 3],
      ['P4 Player', 4],
      ['P5 Player', 5],
    ]);
    // Level in fourth: both listed, then fifth place is the sixth row's 10 (rank 6), cut.
    const levelFourth = season([
      ...six.slice(0, 4),
      { name: 'P4b', lines: [points('g1', birch, 20)] },
      ...six.slice(4, 5),
    ]);
    expect(
      (await board(levelFourth, visitor, { by: 'total', limit: 5 })).map((l) => [l.name, l.rank]),
    ).toEqual([
      ['P1 Player', 1],
      ['P2 Player', 2],
      ['P3 Player', 3],
      ['P4 Player', 4],
      ['P4b Player', 4],
    ]);
  });

  it('adds no row and moves no place for a hidden player level in fifth (S-22)', async () => {
    // A staff-only team's player level with fifth place: a visitor's board is the five
    // places with nobody added; an admin's has both players at 5.
    const store = season([
      ...six.slice(0, 5),
      { name: 'Hid', lines: [points('g1', staffTeam, 10)] },
      ...six.slice(6),
    ]);
    const seen = await board(store, visitor, { by: 'total', limit: 5 });
    expect(seen.map((l) => [l.name, l.rank])).toEqual([
      ['P1 Player', 1],
      ['P2 Player', 2],
      ['P3 Player', 3],
      ['P4 Player', 4],
      ['P5 Player', 5],
    ]);
    expect(JSON.stringify(seen)).not.toContain('Hid');
    expect(
      (await board(store, admin, { by: 'total', limit: 5 })).map((l) => [l.name, l.rank]),
    ).toEqual([
      ['P1 Player', 1],
      ['P2 Player', 2],
      ['P3 Player', 3],
      ['P4 Player', 4],
      ['P5 Player', 5],
      ['Hid Player', 5],
    ]);
  });
});

describe('nobody leads with nothing (cases 37 and 40)', () => {
  it('lists no player at 0: three players at 0 make no board (case 40)', async () => {
    const store = season([
      { name: 'Ada', lines: [points('g1', openTeam, 20, { fg3: 0 })] },
      { name: 'Ben', lines: [points('g1', openTeam, 16, { fg3: 0 })] },
      { name: 'Cy', lines: [points('g1', birch, 12, { fg3: 0 })] },
    ]);
    expect(await board(store, visitor, { measure: 'fg3' })).toEqual([]);
    expect(await board(store, visitor, { measure: 'fg3', by: 'total' })).toEqual([]);
    expect((await board(store, visitor)).map((l) => l.name)).toEqual([
      'Ada Player',
      'Ben Player',
      'Cy Player',
    ]);
  });

  it('gives a lone public player at 0 no place, while the hidden team leads it (case 37, S-22)', async () => {
    // Case 37: a staff-only team's players are no visitor's leaders. Its player made
    // three 3-pointers; the open team's only player made none.
    const store = season([
      { name: 'Ada', lines: [points('g1', openTeam, 10, { fg3: 0 })] },
      { name: 'Sam', lines: [points('g1', staffTeam, 9, { fg3: 3 })] },
    ]);
    expect(await board(store, visitor, { measure: 'fg3' })).toEqual([]);
    expect((await board(store, visitor)).map((l) => [l.name, l.rank])).toEqual([['Ada Player', 1]]);
    expect((await board(store, coach, { measure: 'fg3' })).map((l) => [l.name, l.rank])).toEqual([
      ['Sam Player', 1],
    ]);
  });

  it('keeps a player at 0 out of a board others lead, with no gap in the places', async () => {
    const store = season([
      { name: 'Ada', lines: [points('g1', openTeam, 10, { fg3: 2 })] },
      { name: 'Ben', lines: [points('g1', openTeam, 8, { fg3: 0 })] },
    ]);
    expect((await board(store, visitor, { measure: 'fg3' })).map((l) => [l.name, l.rank])).toEqual([
      ['Ada Player', 1],
    ]);
  });
});

describe('the Team column names the teams a player has numbers with (case 36, R-17)', () => {
  const store = season([
    // 10 for Ash, then 20 for Birch: both teams, 2 games, 30, 15.0.
    { name: 'Ada', lines: [points('g1', openTeam, 10), points('g2', birch, 20)] },
    // Left Ash before its first game (a roster place there, no line) and scored 5 for Birch.
    { name: 'Ben', lines: [points('g2', birch, 5)], rosterOnly: [openTeam] },
  ]);

  it('lists the team a player left before its first game nowhere', async () => {
    expect(await board(store, visitor)).toEqual([
      { name: 'Ada Player', rank: 1, value: 15, games: 2, teamIds: [openTeam, birch] },
      { name: 'Ben Player', rank: 2, value: 5, games: 1, teamIds: [birch] },
    ]);
    const table = await readStatisticsTable(store, { seasonId, viewing: visitor });
    expect(
      table.ok &&
        table.value.players.map((p) => [
          p.name.text,
          p.teamIds,
          p.gamesPlayed,
          p.stats['points']?.total,
        ]),
    ).toEqual([
      ['Ada Player', [openTeam, birch], 2, 30],
      ['Ben Player', [birch], 1, 5],
    ]);
  });

  it('never names a staff-only team, or moves a count, for a player who left it (S-22)', async () => {
    // Cy sat on the staff-only team's roster, left it before it played, and scored for Ash.
    // The roster place still decides privacy (Cy's numbers are worked from the shown
    // teams' games only), and it shows nowhere: not in the Team column, not in a count.
    const left = season([
      { name: 'Ada', lines: [points('g1', openTeam, 10), points('g2', birch, 20)] },
      { name: 'Cy', lines: [points('g1', openTeam, 12)], rosterOnly: [staffTeam] },
    ]);
    const stayed = season([
      { name: 'Ada', lines: [points('g1', openTeam, 10), points('g2', birch, 20)] },
      { name: 'Cy', lines: [points('g1', openTeam, 12)] },
    ]);
    for (const who of [visitor, coach, admin]) {
      expect(await board(left, who)).toEqual(await board(stayed, who));
    }
    expect(await board(left, visitor)).toEqual([
      { name: 'Ada Player', rank: 1, value: 15, games: 2, teamIds: [openTeam, birch] },
      { name: 'Cy Player', rank: 2, value: 12, games: 1, teamIds: [openTeam] },
    ]);
    const table = await readStatisticsTable(left, { seasonId, viewing: visitor });
    expect(JSON.stringify(table.ok && table.value.players)).not.toContain(staffTeam);
  });
});
