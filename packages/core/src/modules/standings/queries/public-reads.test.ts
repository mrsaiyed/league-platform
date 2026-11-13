import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, publicViewer, type Viewer } from '../../people/index.ts';
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
