import { defaultSeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, publicViewer, type Viewer } from '../../people/index.ts';
import type { StandingsReadStore } from '../read-ports.ts';
import {
  divisionId,
  leagueId,
  memoryStandingsRead,
  memoryStandingsReadWithMixedPlayer,
  mixedPlayer,
  openPlayer,
  openTeam,
  seasonId,
  staffPlayer,
  staffTeam,
} from '../memory-standings-read.test-helper.ts';
import type { StatisticsViewing } from '../statistics-source.ts';
import { readStandings } from './read-standings.ts';
import { readStatLeaders } from './read-stat-leaders.ts';
import { readStatisticsTable } from './read-statistics-table.ts';
import { readTeamRecord, readTeamRecords } from './read-team-records.ts';

const viewing = (viewer: Viewer): StatisticsViewing => ({
  leagueId,
  viewer,
  audience: 'adult',
  policy: defaultNamePolicy,
});
const visitor = viewing(publicViewer(leagueId));
const coach = viewing({ leagueId, leagueAdmin: false, staffOfTeamIds: [staffTeam] });
const otherCoach = viewing({ leagueId, leagueAdmin: false, staffOfTeamIds: [openTeam] });
const admin = viewing({ leagueId, leagueAdmin: true, staffOfTeamIds: [] });

describe('readStandings', () => {
  it('gives a table per division with seeds, why teams are ordered, and footnotes', async () => {
    const result = await readStandings(memoryStandingsRead(), { seasonId });
    if (!result.ok) throw new Error('expected a table');
    const [table] = result.value.tables;
    expect(table?.division?.id).toBe(divisionId);
    expect(table?.lines.map((l) => [l.team.name, l.seed, l.orderedBy])).toEqual([
      ['Staff Team', 1, 'head-to-head'],
      ['Open Team', 2, 'record'],
    ]);
    expect(table?.lines[0]?.pointDifference).toBe(20);
    // The deduction in a win-percentage season changes nothing shown, so only the ruling is noted.
    expect(table?.footnotes.map((f) => f.reason)).toEqual(['Ruling']);
    expect(table?.lines[1]?.footnotes).toEqual([1]);
  });

  it('is not restricted by a team statistics setting (S-22) and names no account', async () => {
    const result = await readStandings(memoryStandingsRead(), { seasonId });
    expect(JSON.stringify(result)).toContain('Staff Team');
    expect(JSON.stringify(result)).not.toMatch(/account/i);
  });

  it('finds level teams from the whole numbers, never from rounded percentages (step 2.195)', async () => {
    const base = memoryStandingsRead();
    const [first] = await base.standingsRows(seasonId);
    if (first === undefined) throw new Error('expected a row');
    const team = (id: string, name: string) => ({
      id,
      name,
      slug: name.toLowerCase(),
      color: null,
      divisionId,
      statsVisibility: 'everyone',
    });
    const row = (
      teamId: string,
      rank: number,
      record: { wins: number; losses: number; ties?: number },
      decidedBy: string | null,
    ) => {
      const ties = record.ties ?? 0;
      const gamesPlayed = record.wins + record.losses + ties;
      return { ...first, teamId, rank, seed: rank, ...record, ties, gamesPlayed, decidedBy };
    };
    // 2–1 and 667–333 both read 0.667, and are not level; 1–2 and 2–4 are, exactly; a
    // team with no games is level with one that lost its only game (both 0, as ranked).
    const store: StandingsReadStore = {
      ...base,
      teams: async () => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => team(id, id.toUpperCase())),
      standingsRows: async () => [
        row('a', 1, { wins: 667, losses: 333 }, null),
        row('b', 2, { wins: 2, losses: 1 }, null),
        row('c', 3, { wins: 1, losses: 2 }, 'head-to-head'),
        row('d', 4, { wins: 2, losses: 4 }, 'head-to-head'),
        row('e', 5, { wins: 0, losses: 0 }, 'point-difference'),
        row('f', 6, { wins: 0, losses: 1 }, 'point-difference'),
      ],
      adjustments: async () => [],
      // Read only for the teams' ids: no box score line is asked for (decidedGamesOf).
      decidedGamesOf: async () => {
        throw new Error('the standings read no box score line');
      },
      decidedGames: async () =>
        ['g1', 'g2'].map((gameId) => ({
          gameId,
          status: 'final',
          homeTeamId: 'c',
          awayTeamId: 'd',
        })),
    };
    const result = await readStandings(store, { seasonId });
    if (!result.ok) throw new Error('expected a table');
    expect(result.value.tiebreakers).toEqual(['head-to-head', 'point-difference', 'points-scored']);
    expect(result.value.tables[0]?.levelGroups).toEqual([
      { teamIds: ['c', 'd'], notPlayed: [], on: 'win-percentage', gamesBetween: 2 },
      { teamIds: ['e', 'f'], notPlayed: ['e'], on: 'win-percentage', gamesBetween: null },
    ]);
    // In a table ranked by points, teams are level on their points alone.
    const byPoints: StandingsReadStore = {
      ...store,
      findSeason: async (id) =>
        id === seasonId
          ? {
              id,
              name: 'Fall',
              rules: {
                ...defaultSeasonRules(),
                standings: {
                  ...defaultSeasonRules().standings,
                  rankBy: 'points',
                  columns: ['played', 'wins', 'losses', 'points'],
                },
              },
            }
          : undefined,
      standingsRows: async () => [
        { ...row('a', 1, { wins: 2, losses: 0 }, 'points-scored'), standingsPoints: 4 },
        { ...row('b', 2, { wins: 1, losses: 0, ties: 2 }, 'points-scored'), standingsPoints: 4 },
        { ...row('c', 3, { wins: 0, losses: 1 }, null), standingsPoints: 0 },
      ],
    };
    const points = await readStandings(byPoints, { seasonId });
    expect(points.ok && points.value.tables[0]?.levelGroups).toEqual([
      { teamIds: ['a', 'b'], notPlayed: [], on: 'points', gamesBetween: null },
    ]);
  });

  // The numbers audit's review of step 2.195 (finding 4): a removed division's rows fall
  // into the table without a name, beside teams of no division. Level there, they were
  // never compared by the engine, so no note says anything about them as a group.
  it('writes no level group for teams the engine never compared', async () => {
    const base = memoryStandingsRead();
    const [first] = await base.standingsRows(seasonId);
    if (first === undefined) throw new Error('expected a row');
    const removed = '01900000-0000-7000-8000-0000000000d9';
    const row = (teamId: string, division: string | null, rank: number, wins: number) => ({
      ...first,
      teamId,
      divisionId: division,
      rank,
      seed: rank,
      wins,
      losses: 1 - wins,
      ties: 0,
      gamesPlayed: 1,
      decidedBy: null,
    });
    const store: StandingsReadStore = {
      ...base,
      teams: async () =>
        ['a', 'b', 'c', 'd'].map((id) => ({
          id,
          name: id.toUpperCase(),
          slug: id,
          color: null,
          divisionId: null,
          statsVisibility: 'everyone',
        })),
      divisions: async () => [],
      // a beat b in the removed division; c beat d with no division: each alone at its rank
      // in its own table, so nothing stored says how a compares with c.
      standingsRows: async () => [
        row('a', removed, 1, 1),
        row('b', removed, 2, 0),
        row('c', null, 1, 1),
        row('d', null, 2, 0),
      ],
      adjustments: async () => [],
    };
    const result = await readStandings(store, { seasonId });
    if (!result.ok) throw new Error('expected a table');
    expect(result.value.tables).toHaveLength(1);
    expect(result.value.tables[0]?.lines.map((l) => l.team.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(result.value.tables[0]?.levelGroups).toEqual([]);
    // Level in their own stored tables but not with each other's: none either.
    const reasons: StandingsReadStore = {
      ...store,
      standingsRows: async () => [
        { ...row('a', removed, 1, 1), decidedBy: 'point-difference' },
        { ...row('b', removed, 2, 1), decidedBy: 'point-difference' },
        { ...row('c', null, 1, 1), decidedBy: 'point-difference' },
        { ...row('d', null, 2, 1), decidedBy: 'point-difference' },
      ],
    };
    const mixed = await readStandings(reasons, { seasonId });
    expect(mixed.ok && mixed.value.tables[0]?.levelGroups).toEqual([]);
  });

  it('says when the season is not in the league', async () => {
    expect(await readStandings(memoryStandingsRead(), { seasonId: 'nope' })).toEqual({
      ok: false,
      error: { code: 'season-not-found' },
    });
  });
});

describe('team records', () => {
  it("lists every team's record and seed, and finds one", async () => {
    const all = await readTeamRecords(memoryStandingsRead(), { seasonId });
    expect(all.ok && all.value.map((r) => [r.team.name, r.rank, r.seed, r.wins])).toEqual([
      ['Staff Team', 1, 1, 2],
      ['Open Team', 2, 2, 0],
    ]);
    const one = await readTeamRecord(memoryStandingsRead(), { seasonId, teamId: openTeam });
    expect(one.ok && one.value.losses).toBe(2);
    expect(await readTeamRecord(memoryStandingsRead(), { seasonId, teamId: 'x' })).toMatchObject({
      error: { code: 'team-not-found' },
    });
  });
});

describe('statistics for each kind of viewer (S-22, T-87)', () => {
  const personsIn = (value: unknown) => {
    const text = JSON.stringify(value);
    return { open: text.includes(openPlayer), staff: text.includes(staffPlayer), text };
  };

  it("shows a staff-only team's totals but no player lines to a visitor", async () => {
    const table = await readStatisticsTable(memoryStandingsRead(), { seasonId, viewing: visitor });
    expect(table.ok && table.value.players.map((p) => p.personId)).toEqual([openPlayer]);
    const seen = personsIn(table);
    expect(seen.staff).toBe(false);
    expect(seen.text).not.toContain('99');
    expect(seen.text).not.toContain('Sam');
    expect(
      table.ok && table.value.teams.find((t) => t.teamId === staffTeam)?.stats['points']?.total,
    ).toBe(100);
    expect(
      table.ok && table.value.teams.find((t) => t.teamId === staffTeam)?.playerLinesShown,
    ).toBe(false);
  });

  it("hides them from another team's coach and shows them to the team's coach and an admin", async () => {
    for (const [who, expected] of [
      [otherCoach, false],
      [coach, true],
      [admin, true],
    ] as const) {
      const table = await readStatisticsTable(memoryStandingsRead(), { seasonId, viewing: who });
      expect(personsIn(table).staff).toBe(expected);
    }
  });

  it('never shows a player linked to no team, and a viewer of another league sees totals only', async () => {
    const table = await readStatisticsTable(memoryStandingsRead(), { seasonId, viewing: admin });
    expect(table.ok && table.value.players.map((p) => p.personId)).not.toContain(
      '01900000-0000-7000-8000-00000000f003',
    );
    const foreign = viewing({ leagueId: 'other', leagueAdmin: true, staffOfTeamIds: [staffTeam] });
    const result = await readStatisticsTable(memoryStandingsRead(), { seasonId, viewing: foreign });
    expect(result.ok && result.value.players).toEqual([]);
  });

  it('ranks leaders without the hidden players, so no rank or gap hints at them', async () => {
    const asVisitor = await readStatLeaders(
      memoryStandingsRead(),
      { seasonId, measure: 'points' },
      visitor,
    );
    expect(
      asVisitor.ok && asVisitor.value.leaders.map((l) => [l.personId, l.rank, l.value]),
    ).toEqual([[openPlayer, 1, 14]]);
    const asAdmin = await readStatLeaders(
      memoryStandingsRead(),
      { seasonId, measure: 'points', by: 'average' },
      admin,
    );
    expect(asAdmin.ok && asAdmin.value.leaders.map((l) => [l.personId, l.rank, l.value])).toEqual([
      [staffPlayer, 1, 49.5],
      [openPlayer, 2, 7],
    ]);
  });

  it("applies the league's minimum games and ties share a rank", async () => {
    const none = await readStatLeaders(
      memoryStandingsRead(),
      { seasonId, measure: 'points', minimumGames: 3 },
      admin,
    );
    expect(none.ok && none.value.leaders).toEqual([]);
    expect(
      await readStatLeaders(memoryStandingsRead(), { seasonId, measure: 'bad key!' }, admin),
    ).toMatchObject({ error: { code: 'invalid-input' } });
  });

  it("counts a player of a public team who also sits on a staff-only team only for the public team's games", async () => {
    const store = memoryStandingsReadWithMixedPlayer();
    const asVisitor = await readStatisticsTable(store, { seasonId, viewing: visitor });
    const player = asVisitor.ok
      ? asVisitor.value.players.find((p) => p.personId === mixedPlayer)
      : undefined;
    expect(player?.stats['points']?.total).toBe(10);
    expect(player?.gamesPlayed).toBe(1);
    expect(player?.teamIds).toEqual([openTeam]);
    expect(JSON.stringify(asVisitor)).not.toContain(staffTeam + '","' + mixedPlayer);
    const leaders = await readStatLeaders(store, { seasonId, measure: 'points' }, visitor);
    expect(leaders.ok && leaders.value.leaders.map((l) => [l.personId, l.value])).toEqual([
      [openPlayer, 14],
      [mixedPlayer, 10],
    ]);
    // The staff-only team's own coach sees the stored totals of both teams.
    const asCoach = await readStatisticsTable(store, { seasonId, viewing: coach });
    const full = asCoach.ok
      ? asCoach.value.players.find((p) => p.personId === mixedPlayer)
      : undefined;
    expect(full?.stats['points']?.total).toBe(50);
  });
});

describe('the statistics a season keeps (P7 §1, record 070)', () => {
  const keysWith = async (named: readonly string[], rules: unknown) => {
    const store: StandingsReadStore = {
      ...memoryStandingsRead(),
      findSeason: async (id) => (id === seasonId ? { id, name: 'Fall', rules } : undefined),
      seasonStatKeys: async (id) => (id === seasonId ? named : undefined),
    };
    const table = await readStatisticsTable(store, { seasonId, viewing: visitor });
    return table.ok ? table.value.statKeys : undefined;
  };

  it('keeps the statistics the season names, in its order', async () => {
    expect(await keysWith(['fouls', 'points'], defaultSeasonRules())).toEqual(['fouls', 'points']);
  });

  it("keeps its rules' set when it names none: the box score grid's columns", async () => {
    expect(await keysWith([], defaultSeasonRules())).toEqual(['points', 'fg3', 'fg1', 'fouls']);
    expect(await keysWith([], { ...defaultSeasonRules(), statistics: 'points-fouls' })).toEqual([
      'points',
      'fouls',
    ]);
  });

  it('reads rules it cannot read as the games module does: the starting set the grid asked for', async () => {
    for (const unreadable of [{ version: 1 }, { version: 99 }, 'not rules']) {
      expect(await keysWith([], unreadable)).toEqual(['points', 'fg3', 'fg1', 'fouls']);
    }
  });
});

describe("a team's season totals count what was charged to the team itself (step 2.196, H1)", () => {
  const full = { ...defaultSeasonRules(), statistics: 'full' as const };
  const storeWith = (over: Partial<StandingsReadStore>): StandingsReadStore => ({
    ...memoryStandingsRead(),
    findSeason: async (id) => (id === seasonId ? { id, name: 'Fall', rules: full } : undefined),
    seasonStatKeys: async (id) => (id === seasonId ? [] : undefined),
    ...over,
  });
  const turnoversOf = async (store: StandingsReadStore, teamId: string) => {
    const table = await readStatisticsTable(store, { seasonId, viewing: visitor });
    if (!table.ok) throw new Error('no table');
    expect(table.value.statKeys).toContain('turnovers');
    return table.value.teams.find((team) => team.teamId === teamId)?.stats['turnovers'];
  };

  it("gives case 18's team 2 turnovers in a season keeping the full set: its player's 1 and its own 1", async () => {
    const store = storeWith({
      // The players' lines, summed: the player's one turnover.
      teamStatTotals: async () => [
        { teamId: openTeam, statKey: 'turnovers', total: 1, gamesRecorded: 1 },
        { teamId: staffTeam, statKey: 'turnovers', total: 0, gamesRecorded: 1 },
      ],
      // The audit's case 18: one charged to the team, one to its player, who came on.
      teamTurnoverGames: async () => [
        { gameId: 'g18', teamId: openTeam, turnovers: 1, countedByLines: true },
      ],
    });
    expect(await turnoversOf(store, openTeam)).toEqual({ total: 2, gamesRecorded: 1, average: 2 });
    // The other team was charged nothing of its own.
    expect(await turnoversOf(store, staffTeam)).toEqual({ total: 0, gamesRecorded: 1, average: 0 });
  });

  it('counts a game where only the team itself was charged, with no player of it on, once', async () => {
    const store = storeWith({
      teamStatTotals: async () => [
        { teamId: openTeam, statKey: 'turnovers', total: 3, gamesRecorded: 2 },
      ],
      teamTurnoverGames: async () => [
        { gameId: 'g9', teamId: openTeam, turnovers: 1, countedByLines: false },
      ],
    });
    expect(await turnoversOf(store, openTeam)).toEqual({
      total: 4,
      gamesRecorded: 3,
      average: 4 / 3,
    });
  });

  it("gives a team with no turnover line of its own its team's turnovers, over that game", async () => {
    const store = storeWith({
      teamTurnoverGames: async () => [
        { gameId: 'g1', teamId: staffTeam, turnovers: 2, countedByLines: false },
        { gameId: 'g2', teamId: staffTeam, turnovers: 1, countedByLines: false },
      ],
    });
    expect(await turnoversOf(store, staffTeam)).toEqual({
      total: 3,
      gamesRecorded: 2,
      average: 1.5,
    });
  });

  it("names the statistics whose team total is not its players' numbers, for a team whose players show", async () => {
    const teamsOf = async (store: StandingsReadStore) => {
      const table = await readStatisticsTable(store, { seasonId, viewing: visitor });
      if (!table.ok) throw new Error('no table');
      return Object.fromEntries(table.value.teams.map((t) => [t.teamId, t.countsMoreThanPlayers]));
    };
    // Points typed as 50 where the players add to 48, and a team turnover, for both teams.
    const store = storeWith({
      teamStatTotals: async () => [
        { teamId: openTeam, statKey: 'points', total: 50, linesTotal: 48, gamesRecorded: 1 },
        { teamId: staffTeam, statKey: 'points', total: 45, linesTotal: 40, gamesRecorded: 1 },
      ],
      teamTurnoverGames: async () => [
        { gameId: 'g', teamId: openTeam, turnovers: 1, countedByLines: true },
        { gameId: 'g', teamId: staffTeam, turnovers: 1, countedByLines: true },
      ],
    });
    // The staff-only team's players are not shown to a visitor: nothing to add up there.
    expect(await teamsOf(store)).toEqual({
      [openTeam]: ['points', 'turnovers'],
      [staffTeam]: [],
    });
    // Points that are what the players add to, and no team turnover: none.
    expect(
      await teamsOf(
        storeWith({
          teamStatTotals: async () => [
            { teamId: openTeam, statKey: 'points', total: 48, linesTotal: 48, gamesRecorded: 1 },
          ],
        }),
      ),
    ).toEqual({ [openTeam]: [], [staffTeam]: [] });
  });
});
