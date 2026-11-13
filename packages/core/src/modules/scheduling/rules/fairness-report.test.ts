import { describe, expect, it } from 'vitest';
import { fairnessReport } from './fairness-report.ts';
import { generatePairings } from './generate-pairings.ts';
import type { FairnessRules } from './pairing-types.ts';
import { pairingsAsSchedule, randomFrom, randomTeams, teamsOf } from './pairings.test-helper.ts';
import { game } from './schedule-test-data.ts';

const allOn: FairnessRules = {
  noTeamTwiceInOneDay: true,
  spreadEarlyAndLateSlots: true,
  balanceHomeAndAway: true,
  avoidSameMatchupTwoWeeksRunning: true,
  keepGamesWithinDivision: true,
};
const allOff: FairnessRules = {
  noTeamTwiceInOneDay: false,
  spreadEarlyAndLateSlots: false,
  balanceHomeAndAway: false,
  avoidSameMatchupTwoWeeksRunning: false,
  keepGamesWithinDivision: false,
};

/** A schedule built by hand, with something wrong under every rule. */
function handBuilt() {
  const teams = [...teamsOf('ab', 'north'), ...teamsOf('cd', 'south')];
  const rounds = [
    { id: 'r1', label: 'Week 1', date: '2026-10-04' },
    { id: 'r2', label: 'Week 2', date: '2026-10-11' },
    { id: 'r3', label: 'Week 3', date: '2026-10-18' },
  ];
  const games = [
    game('g1', { homeTeamId: 'a', awayTeamId: 'b', time: '18:00' }),
    game('g2', { homeTeamId: 'c', awayTeamId: 'd', time: '19:00' }),
    game('g3', { homeTeamId: 'a', awayTeamId: 'c', time: '20:00' }),
    game('g4', { roundId: 'r2', date: '2026-10-11', homeTeamId: 'a', awayTeamId: 'b' }),
    game('g5', {
      roundId: 'r2',
      date: '2026-10-11',
      time: '19:00',
      homeTeamId: 'd',
      awayTeamId: 'c',
    }),
    game('g6', {
      roundId: 'r3',
      date: '2026-10-18',
      homeTeamId: 'b',
      awayTeamId: 'd',
      status: 'postponed',
    }),
    game('g7', { roundId: 'r3', date: '2026-10-18', homeTeamId: 'a', awayTeamId: 'd' }),
    // No round: a week of its own, by its date.
    game('g8', { roundId: null, date: '2026-10-25', time: null, homeTeamId: 'b', awayTeamId: 'a' }),
  ];
  return { teams, rounds, games };
}

describe('fairnessReport, worked examples (P7 §4.2)', () => {
  it('counts each team and reports every rule the schedule breaks, with why', () => {
    const report = fairnessReport({
      ...handBuilt(),
      rules: allOn,
      timesEachPair: 2,
      withinDivisions: true,
      unavailableDates: [{ teamId: 'd', date: '2026-10-18' }],
    });

    expect(report.teams).toEqual([
      { teamId: 'a', games: 5, home: 4, away: 1, early: 2, late: 1, byes: 0, backToBack: 1 },
      { teamId: 'b', games: 3, home: 1, away: 2, early: 2, late: 0, byes: 1, backToBack: 1 },
      { teamId: 'c', games: 3, home: 1, away: 2, early: 0, late: 2, byes: 2, backToBack: 1 },
      { teamId: 'd', games: 3, home: 1, away: 2, early: 0, late: 1, byes: 1, backToBack: 1 },
    ]);
    expect(report.issues).toEqual([
      { rule: 'no-team-twice-in-one-day', teamId: 'a', date: '2026-10-04', gameIds: ['g1', 'g3'] },
      { rule: 'no-team-twice-in-one-day', teamId: 'c', date: '2026-10-04', gameIds: ['g2', 'g3'] },
      {
        rule: 'spread-early-and-late-slots',
        teamId: 'a',
        slot: 'early',
        count: 2,
        fewest: 0,
        most: 2,
      },
      {
        rule: 'spread-early-and-late-slots',
        teamId: 'b',
        slot: 'early',
        count: 2,
        fewest: 0,
        most: 2,
      },
      {
        rule: 'spread-early-and-late-slots',
        teamId: 'c',
        slot: 'early',
        count: 0,
        fewest: 0,
        most: 2,
      },
      {
        rule: 'spread-early-and-late-slots',
        teamId: 'd',
        slot: 'early',
        count: 0,
        fewest: 0,
        most: 2,
      },
      {
        rule: 'spread-early-and-late-slots',
        teamId: 'b',
        slot: 'late',
        count: 0,
        fewest: 0,
        most: 2,
      },
      {
        rule: 'spread-early-and-late-slots',
        teamId: 'c',
        slot: 'late',
        count: 2,
        fewest: 0,
        most: 2,
      },
      { rule: 'balance-home-and-away', teamId: 'a', home: 4, away: 1 },
      {
        rule: 'avoid-same-matchup-two-weeks-running',
        teamIds: ['a', 'b'],
        gameIds: ['g1', 'g4'],
      },
      {
        rule: 'avoid-same-matchup-two-weeks-running',
        teamIds: ['c', 'd'],
        gameIds: ['g2', 'g5'],
      },
      { rule: 'keep-games-within-division', gameId: 'g3', teamIds: ['a', 'c'] },
      { rule: 'keep-games-within-division', gameId: 'g7', teamIds: ['a', 'd'] },
      { rule: 'times-each-pair', teamIds: ['a', 'b'], expected: 2, actual: 3 },
      { rule: 'team-unavailable-date', teamId: 'd', date: '2026-10-18', gameId: 'g7' },
    ]);
  });

  it('reports only the team requests when every rule is off and no meeting count is set', () => {
    const report = fairnessReport({
      ...handBuilt(),
      rules: allOff,
      unavailableDates: [{ teamId: 'd', date: '2026-10-18' }],
    });
    expect(report.issues).toEqual([
      { rule: 'team-unavailable-date', teamId: 'd', date: '2026-10-18', gameId: 'g7' },
    ]);
    expect(report.teams.map((t) => t.backToBack)).toEqual([1, 1, 1, 1]);
  });

  it('counts meetings across divisions when the pairings were generated league-wide', () => {
    const report = fairnessReport({ ...handBuilt(), rules: allOff, timesEachPair: 1 });
    expect(report.issues).toEqual([
      { rule: 'times-each-pair', teamIds: ['a', 'b'], expected: 1, actual: 3 },
      { rule: 'times-each-pair', teamIds: ['b', 'c'], expected: 1, actual: 0 },
      { rule: 'times-each-pair', teamIds: ['b', 'd'], expected: 1, actual: 0 },
      { rule: 'times-each-pair', teamIds: ['c', 'd'], expected: 1, actual: 2 },
    ]);
  });

  it('counts meetings only within divisions when generated so, whatever the division rule', () => {
    const report = fairnessReport({
      ...handBuilt(),
      rules: allOff,
      timesEachPair: 1,
      withinDivisions: true,
    });
    expect(report.issues).toEqual([
      { rule: 'times-each-pair', teamIds: ['a', 'b'], expected: 1, actual: 3 },
      { rule: 'times-each-pair', teamIds: ['c', 'd'], expected: 1, actual: 2 },
    ]);
  });

  it('takes weeks in date order whatever order the rounds are listed in', () => {
    const { teams, rounds, games } = handBuilt();
    const report = fairnessReport({ teams, rounds: [...rounds].reverse(), games, rules: allOff });
    expect(report.teams.map((t) => [t.teamId, t.byes, t.backToBack])).toEqual([
      ['a', 0, 1],
      ['b', 1, 1],
      ['c', 2, 1],
      ['d', 1, 1],
    ]);
  });

  it('leaves out postponed and cancelled games, and empty weeks are no one’s bye', () => {
    const report = fairnessReport({
      teams: teamsOf('ab'),
      rounds: [
        { id: 'r1', label: 'Week 1', date: '2026-10-04' },
        { id: 'r2', label: 'Week 2', date: '2026-10-11' },
      ],
      games: [game('g1'), game('g2', { roundId: 'r2', date: '2026-10-11', status: 'cancelled' })],
      rules: allOn,
    });
    expect(report.teams).toEqual([
      { teamId: 'a', games: 1, home: 1, away: 0, early: 0, late: 0, byes: 0, backToBack: 0 },
      { teamId: 'b', games: 1, home: 0, away: 1, early: 0, late: 0, byes: 0, backToBack: 0 },
    ]);
    expect(report.issues).toEqual([]);
  });
});

describe('fairnessReport on generated pairings (T-182)', () => {
  const cases = Array.from({ length: 150 }, (_, i) => i + 1);

  it.each(cases)('finds nothing unfair in the pairings for made-up league %i', (seed) => {
    const teams = randomTeams(seed);
    const random = randomFrom(seed * 104729);
    const timesEachPair = random.int(3) + 1;
    const withinDivisions = random.chance();
    const result = generatePairings({ teams, timesEachPair, withinDivisions, arrangement: seed });
    if (!result.ok) return;

    const report = fairnessReport({
      teams,
      ...pairingsAsSchedule(result.rounds),
      rules: { ...allOn, keepGamesWithinDivision: withinDivisions },
      timesEachPair,
      withinDivisions,
    });

    // The byes the report counts are the byes the pairings list.
    const byes = new Map<string, number>();
    for (const id of result.rounds.flatMap((r) => r.byes)) byes.set(id, (byes.get(id) ?? 0) + 1);
    expect(report.teams.map((t) => t.byes)).toEqual(teams.map((t) => byes.get(t.id) ?? 0));

    // The only thing it may find is a two-team group meeting week after week.
    const groupSize = new Map<string | null, number>();
    for (const t of teams) {
      const key = withinDivisions ? t.divisionId : null;
      groupSize.set(key, (groupSize.get(key) ?? 0) + 1);
    }
    const divisionOf = new Map(teams.map((t) => [t.id, withinDivisions ? t.divisionId : null]));
    const unexpected = report.issues.filter(
      (issue) =>
        issue.rule !== 'avoid-same-matchup-two-weeks-running' ||
        groupSize.get(divisionOf.get(issue.teamIds[0]) ?? null) !== 2,
    );
    expect(unexpected).toEqual([]);
  });
});
