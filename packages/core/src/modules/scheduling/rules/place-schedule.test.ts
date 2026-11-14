import { describe, expect, it } from 'vitest';
import { findClashes } from './find-clashes.ts';
import { generatePairings } from './generate-pairings.ts';
import type { FairnessIssue, FairnessRules, PairingTeam } from './pairing-types.ts';
import { placeSchedule, strictRules } from './place-schedule.ts';
import type { PlacementInput, PlacementResult } from './placement-types.ts';
import { randomFrom, teamsOf } from './pairings.test-helper.ts';
import type { ScheduleGame } from './schedule-types.ts';

const allOn: FairnessRules = {
  noTeamTwiceInOneDay: true,
  spreadEarlyAndLateSlots: true,
  balanceHomeAndAway: true,
  avoidSameMatchupTwoWeeksRunning: true,
  keepGamesWithinDivision: true,
};

const roundLabel = (n: number): string => `Week ${n}`;

function placed(input: PlacementInput): Extract<PlacementResult, { ok: true }> {
  const result = placeSchedule(input);
  if (!result.ok) throw new Error(`not placed: ${JSON.stringify(result.error)}`);
  return result;
}

/** Games written as text, one line a date: "10-04 18:00 avd 19:00 bvc". */
function shown(games: readonly ScheduleGame[]): string[] {
  const byDate = new Map<string, string[]>();
  for (const g of games) {
    const line = byDate.get(g.date) ?? [];
    line.push(
      `${g.time ?? '--'}${g.court === 'Court 1' ? '' : `/${g.court ?? ''}`} ${g.homeTeamId}v${g.awayTeamId}`,
    );
    byDate.set(g.date, line);
  }
  return [...byDate].map(([date, line]) => `${date.slice(5)} ${line.join(' ')}`);
}

/** Sundays in October and November 2026, 18:00 and 19:00 on one court. */
function sundays(over: Partial<PlacementInput> = {}): PlacementInput {
  return {
    teams: teamsOf('abcd'),
    timesEachPair: 1,
    rules: allOn,
    firstDate: '2026-10-04',
    lastDate: '2026-11-29',
    playingDays: [0],
    times: ['18:00', '19:00'],
    courts: [{ venueId: 'v1', court: 'Court 1' }],
    roundLabel,
    ...over,
  };
}

const strict = new Set<string>(strictRules);

/** The game ids a strict issue names. */
function strictGameIds(issue: FairnessIssue): string[] | null {
  if (!strict.has(issue.rule)) return null;
  if ('gameIds' in issue) return issue.gameIds;
  if ('gameId' in issue) return [issue.gameId];
  return [];
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

function meetings(
  games: readonly { homeTeamId: string; awayTeamId: string }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of games) {
    const key = pairKey(g.homeTeamId, g.awayTeamId);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

describe('placeSchedule, worked examples (P7 §4.1, §4.2)', () => {
  it('places one round a week, earliest times first, early and late shared out', () => {
    const result = placed(sundays({ timesEachPair: 2 }));
    expect(shown(result.games)).toEqual([
      '10-04 18:00 avd 19:00 bvc',
      '10-11 18:00 dvb 19:00 cva',
      '10-18 18:00 cvd 19:00 avb',
      '10-25 18:00 avc 19:00 bvd',
      '11-01 18:00 bva 19:00 dvc',
      '11-08 18:00 cvb 19:00 dva',
    ]);
    expect(result.rounds.slice(0, 2)).toEqual([
      { id: 'round-1', label: 'Week 1', date: '2026-10-04' },
      { id: 'round-2', label: 'Week 2', date: '2026-10-11' },
    ]);
    expect(result.unplaced).toEqual([]);
    expect(result.report.issues).toEqual([]);
    expect(result.report.teams.map((t) => [t.teamId, t.early, t.late, t.home, t.away])).toEqual([
      ['a', 3, 3, 3, 3],
      ['b', 3, 3, 3, 3],
      ['c', 3, 3, 3, 3],
      ['d', 3, 3, 3, 3],
    ]);
  });

  it('reports what it could not even out', () => {
    // Four teams meeting once, two games a Sunday: three early games are six early places
    // for four teams, and the pairings leave no way to give each team one or two. The
    // schedule is still made; the report says which teams are off and by how much.
    const result = placed(sundays());
    expect(result.unplaced).toEqual([]);
    expect(result.report.issues.length).toBeGreaterThan(0);
    expect(result.report.issues.every((i) => i.rule === 'spread-early-and-late-slots')).toBe(true);
  });

  it('skips the dates to skip and keeps team requests, moving a game to a spare week', () => {
    const result = placed(
      sundays({
        // A date with a single game has no early or late slot, so the spreading is left out here.
        rules: { ...allOn, spreadEarlyAndLateSlots: false },
        skipDates: ['2026-10-11'],
        unavailableDates: [{ teamId: 'c', date: '2026-10-18' }],
      }),
    );
    // Round 2 goes to 10-18, where c cannot play; c's game waits for the first week it fits.
    expect(shown(result.games)).toEqual([
      '10-04 18:00 avd 19:00 bvc',
      '10-18 18:00 dvb',
      '10-25 18:00 cvd 19:00 avb',
      '11-01 18:00 cva',
    ]);
    expect(result.unplaced).toEqual([]);
    expect(result.report.issues).toEqual([]);
  });

  it('spreads a week over its playing days and fills a second court', () => {
    const result = placed(
      sundays({
        teams: teamsOf('abcdefgh'),
        firstDate: '2026-10-03',
        lastDate: '2026-10-11',
        playingDays: [6, 0],
        times: ['10:00'],
        courts: [
          { venueId: 'v1', court: 'Court 1' },
          { venueId: 'v1', court: 'Court 2' },
        ],
      }),
    );
    // Two weeks of four games: two on each day, one on each court.
    expect(result.games.filter((g) => g.date === '2026-10-03')).toHaveLength(2);
    expect(result.games.filter((g) => g.date === '2026-10-04')).toHaveLength(2);
    expect(result.games.filter((g) => g.date === '2026-10-10')).toHaveLength(2);
    expect(result.games.filter((g) => g.date === '2026-10-11')).toHaveLength(2);
    expect(findClashes(result.games, [])).toEqual([]);
    // The season holds two of the seven rounds; the rest is returned, not forced in.
    expect(result.unplaced).toHaveLength(28 - 8);
  });

  it('lists what does not fit when the season is too short', () => {
    const result = placed(sundays({ lastDate: '2026-10-11' }));
    expect(result.games).toHaveLength(4);
    expect(result.unplaced).toHaveLength(2);
    expect(result.report.issues.filter((i) => i.rule === 'times-each-pair')).toHaveLength(2);
  });

  it('never puts the same matchup in two weeks running, when that rule is on', () => {
    // Weeks without games do not count (P7 §4.2, as the fairness report reads it), so two
    // lone teams cannot meet a second time without it: the rest is returned, not forced in.
    const on = placed(sundays({ teams: teamsOf('ab'), timesEachPair: 3 }));
    expect(on.games.map((g) => g.date)).toEqual(['2026-10-04']);
    expect(on.unplaced).toHaveLength(2);
    // Three teams meeting twice: the turns are arranged so no pair meets in weeks running.
    const three = placed(sundays({ teams: teamsOf('abc'), timesEachPair: 2 }));
    expect(three.games).toHaveLength(6);
    expect(three.report.issues).toEqual([]);
    const off = placed(
      sundays({
        teams: teamsOf('ab'),
        timesEachPair: 3,
        rules: { ...allOn, avoidSameMatchupTwoWeeksRunning: false },
      }),
    );
    expect(off.games.map((g) => g.date)).toEqual(['2026-10-04', '2026-10-11', '2026-10-18']);
  });

  it('keeps locked games where they are and places the rest around them', () => {
    const six = { teams: teamsOf('abcdef'), times: ['18:00', '19:00', '20:00'] };
    const first = placed(sundays(six));
    expect(first.report.issues).toEqual([]);
    const lockedGameIds = first.games.filter((g) => g.date === '2026-10-11').map((g) => g.id);
    const again = placed(
      sundays({
        ...six,
        arrangement: 7,
        current: { rounds: first.rounds, games: first.games },
        lockedGameIds,
      }),
    );
    for (const id of lockedGameIds) {
      expect(again.games.find((g) => g.id === id)).toEqual(first.games.find((g) => g.id === id));
    }
    expect(again.rounds.find((r) => r.date === '2026-10-11')).toEqual(
      first.rounds.find((r) => r.date === '2026-10-11'),
    );
    expect(again.unplaced).toEqual([]);
    // The locked week fixes who has its early and late slots, so only the spreading may fall short.
    expect(again.report.issues.filter((i) => i.rule !== 'spread-early-and-late-slots')).toEqual([]);
    expect(new Set(again.games.map((g) => g.id)).size).toBe(again.games.length);
  });

  it('gives a reused round the date of its new first game, not its old date', () => {
    const first = placed(sundays());
    const stale = first.rounds.map((r) => {
      const date = r.date ?? '';
      return {
        ...r,
        date: `${date.slice(0, 8)}${String(Number(date.slice(8)) + 1).padStart(2, '0')}`,
      };
    });
    const again = placed(sundays({ current: { rounds: stale, games: first.games } }));
    expect(again.rounds.map((r) => r.id)).toEqual(stale.map((r) => r.id));
    for (const round of again.rounds) {
      const dates = again.games.filter((g) => g.roundId === round.id).map((g) => g.date);
      expect(round.date).toBe([...dates].sort()[0]);
    }
  });

  it('gives the same schedule for the same inputs and another for another arrangement', () => {
    const input = sundays({ teams: teamsOf('abcdefg'), timesEachPair: 2, lastDate: '2027-01-31' });
    expect(placeSchedule(input)).toEqual(placeSchedule(input));
    expect(placed({ ...input, arrangement: 3 }).games).not.toEqual(placed(input).games);
  });

  it('lays out a large league: thirty teams meeting twice on four courts', () => {
    const teams = Array.from({ length: 30 }, (_, i) => ({ id: `t${i + 1}`, divisionId: null }));
    const result = placed(
      sundays({
        teams,
        timesEachPair: 2,
        // 58 rounds, a week each; t1's game moves to the Sunday of the Saturday it asked to miss.
        lastDate: '2027-12-26',
        playingDays: [6, 0],
        times: ['10:00', '12:00', '14:00', '16:00'],
        courts: [1, 2, 3, 4].map((n) => ({ venueId: 'v1', court: `Court ${n}` })),
        unavailableDates: [{ teamId: 't1', date: '2026-10-10' }],
      }),
    );
    expect(result.games).toHaveLength(30 * 29);
    expect(result.unplaced).toEqual([]);
    expect(result.report.issues.filter((i) => i.rule !== 'spread-early-and-late-slots')).toEqual(
      [],
    );
  });

  it('refuses inputs it cannot use', () => {
    const error = (over: Partial<PlacementInput>): unknown => {
      const result = placeSchedule(sundays(over));
      return result.ok ? null : result.error;
    };
    expect(error({ firstDate: '2026-02-30' })).toEqual({
      code: 'invalid-date',
      value: '2026-02-30',
    });
    expect(error({ lastDate: '2026-10-01' })).toEqual({
      code: 'season-ends-before-it-starts',
      firstDate: '2026-10-04',
      lastDate: '2026-10-01',
    });
    expect(error({ lastDate: '2029-01-01' })).toMatchObject({ code: 'season-too-long' });
    expect(error({ skipDates: ['soon'] })).toEqual({ code: 'invalid-date', value: 'soon' });
    expect(error({ playingDays: [] })).toEqual({ code: 'no-playing-days' });
    expect(error({ playingDays: [7] })).toEqual({ code: 'invalid-playing-day', value: 7 });
    expect(error({ arrangement: -1 })).toEqual({ code: 'invalid-arrangement', value: -1 });
    expect(error({ arrangement: 1.5 })).toEqual({ code: 'invalid-arrangement', value: 1.5 });
    expect(error({ times: [] })).toEqual({ code: 'no-times' });
    expect(error({ times: ['6pm'] })).toEqual({ code: 'invalid-time', value: '6pm' });
    expect(error({ courts: [] })).toEqual({ code: 'no-courts' });
    expect(error({ courts: [{ venueId: null, court: ' ' }] })).toEqual({
      code: 'empty-court-name',
    });
    expect(error({ lockedGameIds: ['g9'] })).toEqual({ code: 'unknown-locked-game', gameId: 'g9' });
    expect(error({ timesEachPair: 0 })).toEqual({ code: 'invalid-times-each-pair', value: 0 });
    expect(error({ teams: teamsOf('a') })).toMatchObject({ code: 'too-few-teams' });
  });
});

/** A made-up season from a seed: 2 to 12 teams, any rules, days, slots, courts and requests. */
function randomSeason(seed: number): PlacementInput {
  const random = randomFrom(seed);
  const count = 2 + random.int(11);
  // Up to two divisions, each with two teams or more.
  const divisions = Math.min(random.int(3), Math.floor(count / 2));
  const teams: PairingTeam[] = Array.from({ length: count }, (_, i) => ({
    id: `team-${i + 1}`,
    divisionId: divisions === 0 ? null : `division-${(i % divisions) + 1}`,
  }));
  const rules: FairnessRules = {
    noTeamTwiceInOneDay: random.chance(),
    spreadEarlyAndLateSlots: random.chance(),
    balanceHomeAndAway: random.chance(),
    avoidSameMatchupTwoWeeksRunning: random.chance(),
    keepGamesWithinDivision: divisions > 0 && random.chance(),
  };
  const day = (n: number): string => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
  const playingDays = [...new Set([random.int(7), random.int(7), random.int(7)])].slice(
    0,
    1 + random.int(3),
  );
  const times = ['17:00', '18:00', '19:00', '20:00'].slice(0, 1 + random.int(4));
  const courts = Array.from({ length: 1 + random.int(3) }, (_, i) => ({
    venueId: i === 2 ? 'v2' : 'v1',
    court: `Court ${i + 1}`,
  }));
  const length = 20 + random.int(200);
  const skipDates = Array.from({ length: random.int(6) }, () => day(random.int(length)));
  const unavailableDates = Array.from({ length: random.int(8) }, () => ({
    teamId: `team-${1 + random.int(count)}`,
    date: day(random.int(length)),
  }));
  return {
    teams,
    timesEachPair: 1 + random.int(3),
    rules,
    firstDate: day(0),
    lastDate: day(length),
    playingDays,
    times,
    courts,
    skipDates,
    unavailableDates,
    arrangement: random.int(4),
    roundLabel,
  };
}

/** Every game of the pairings is placed, locked or listed as unplaced: none lost, none made up. */
function expectAllAccountedFor(
  input: PlacementInput,
  result: Extract<PlacementResult, { ok: true }>,
): void {
  const pairings = generatePairings({
    teams: input.teams,
    timesEachPair: input.timesEachPair,
    withinDivisions: input.rules.keepGamesWithinDivision,
    arrangement: input.arrangement ?? 0,
  });
  if (!pairings.ok) throw new Error('no pairings');
  const expected = meetings(pairings.rounds.flatMap((r) => r.games));
  const actual = meetings([...result.games, ...result.unplaced]);
  expect(actual).toEqual(expected);
}

describe('placeSchedule, generated inputs (T-182)', () => {
  it('never breaks a strict rule, never clashes and accounts for every game', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const input = randomSeason(seed);
      const result = placed(input);
      const context = `seed ${seed}`;
      for (const issue of result.report.issues) {
        expect(strictGameIds(issue), `${context}: ${JSON.stringify(issue)}`).toBeNull();
      }
      expect(findClashes(result.games, input.skipDates ?? []), context).toEqual([]);
      expectAllAccountedFor(input, result);
      if (result.unplaced.length === 0) {
        // Nothing missing: every pair meets the chosen number of times, home and away even.
        expect(
          result.report.issues.filter(
            (i) => i.rule === 'times-each-pair' || i.rule === 'balance-home-and-away',
          ),
          context,
        ).toEqual([]);
      }
    }
  });

  it('places every game when the season has room and no requests stand in the way', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const input = randomSeason(seed);
      const games = Math.ceil(input.teams.length / 2);
      const roomy: PlacementInput = {
        ...input,
        lastDate: '2027-08-31',
        playingDays: [0],
        times: ['18:00'],
        courts: Array.from({ length: games }, (_, i) => ({
          venueId: 'v1',
          court: `Court ${i + 1}`,
        })),
        skipDates: [],
        unavailableDates: [],
      };
      // Two lone teams cannot meet again without meeting in weeks running (see the worked example).
      if (input.teams.length === 2 && input.rules.avoidSameMatchupTwoWeeksRunning) continue;
      const result = placed(roomy);
      expect(result.unplaced, `seed ${seed}`).toEqual([]);
      expect(result.report.issues, `seed ${seed}`).toEqual([]);
    }
  });

  it('gives the same schedule for the same inputs', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const input = randomSeason(seed);
      expect(placeSchedule(input), `seed ${seed}`).toEqual(placeSchedule({ ...input }));
    }
  });

  it('keeps locked games exactly and regenerates the rest within the strict rules', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = randomSeason(seed);
      const first = placed(input);
      const random = randomFrom(seed + 1000);
      const lockedGameIds = first.games.filter(() => random.int(4) === 0).map((g) => g.id);
      const again = placed({
        ...input,
        arrangement: (input.arrangement ?? 0) + 1,
        current: { rounds: first.rounds, games: first.games },
        lockedGameIds,
      });
      const context = `seed ${seed}`;
      const lockedSet = new Set(lockedGameIds);
      for (const id of lockedGameIds) {
        expect(
          again.games.find((g) => g.id === id),
          context,
        ).toEqual(first.games.find((g) => g.id === id));
      }
      for (const g of again.games) {
        const r = again.rounds.find((round) => round.id === g.roundId);
        expect(r, `${context}: round of ${g.id}`).toBeDefined();
      }
      expect(new Set(again.games.map((g) => g.id)).size, context).toBe(again.games.length);
      for (const issue of again.report.issues) {
        const ids = strictGameIds(issue);
        if (ids === null) continue;
        // A strict issue can only come from the admin's own locked games.
        expect(
          ids.every((id) => lockedSet.has(id)),
          `${context}: ${JSON.stringify(issue)}`,
        ).toBe(true);
      }
      for (const clash of findClashes(again.games, input.skipDates ?? [])) {
        const ids = clash.kind === 'skipped-date' ? [clash.gameId] : clash.gameIds;
        expect(
          ids.every((id) => lockedSet.has(id)),
          `${context}: ${JSON.stringify(clash)}`,
        ).toBe(true);
      }
      expectAllAccountedFor({ ...input, arrangement: (input.arrangement ?? 0) + 1 }, again);
    }
  });
});
