import type {
  FairnessInput,
  FairnessIssue,
  FairnessReport,
  TeamFairness,
} from './pairing-types.ts';
import type { ScheduleGame } from './schedule-types.ts';

/**
 * The fairness report (P7 §4.2) for any schedule, generated or built by hand: per team, how
 * many games, home and away games, early and late slots, byes and back-to-back weeks, and
 * every rule the schedule does not fully satisfy with what is needed to say why.
 *
 * What the words mean here:
 * - Postponed and cancelled games hold no place and are not counted.
 * - A week is a round of the schedule. A game with no round belongs to the round on its date,
 *   or, when no round falls on that date, to a week of its own by date. Weeks are taken in date
 *   order, and weeks with no games at all (a holiday) are left out.
 * - A bye is a week with games in which the team has none.
 * - Early and late: on a date with games at two or more times, the earliest time is early and
 *   the latest is late. Games with no time are neither.
 * - Back-to-back: the same two teams meeting in two weeks running.
 * - Early and late slots are spread evenly when no team has two more of either than another.
 * - Home and away are balanced when a team's home and away games differ by at most one.
 *
 * Only the rules switched on are reported, except a team's unavailable dates, which are the
 * team's own requests and always reported, and the number of meetings, reported whenever
 * `timesEachPair` is given. Which pairs should meet follows `withinDivisions` (how the pairings
 * were generated), not the `keepGamesWithinDivision` rule. The input is never changed.
 */
export function fairnessReport(input: FairnessInput): FairnessReport {
  const { rules } = input;
  const teams = uniqueTeams(input);
  const known = new Map(teams.map((t, i) => [t.id, { division: t.divisionId, order: i }]));
  const holding = input.games.filter((g) => g.status !== 'postponed' && g.status !== 'cancelled');
  const issues: FairnessIssue[] = [];
  const byOrder = (a: string, b: string): [string, string] =>
    (known.get(a)?.order ?? Infinity) <= (known.get(b)?.order ?? Infinity) ? [a, b] : [b, a];

  // Early and late slots: the earliest and latest times used on each date.
  const timesOn = new Map<string, Set<string>>();
  for (const g of holding) {
    if (g.time === null) continue;
    const times = timesOn.get(g.date) ?? new Set<string>();
    times.add(g.time);
    timesOn.set(g.date, times);
  }
  const slotOf = (g: ScheduleGame): 'early' | 'late' | null => {
    const times = timesOn.get(g.date);
    if (g.time === null || !times || times.size < 2) return null;
    const sorted = [...times].sort();
    if (g.time === sorted[0]) return 'early';
    if (g.time === sorted[sorted.length - 1]) return 'late';
    return null;
  };

  const weeks = weeksOf(input, holding);
  const stats = new Map<string, TeamFairness>(
    teams.map((t) => [
      t.id,
      { teamId: t.id, games: 0, home: 0, away: 0, early: 0, late: 0, byes: 0, backToBack: 0 },
    ]),
  );
  const gamesOn = new Map<string, Map<string, string[]>>(); // team → date → game ids
  for (const g of holding) {
    const slot = slotOf(g);
    for (const [teamId, side] of [
      [g.homeTeamId, 'home'],
      [g.awayTeamId, 'away'],
    ] as const) {
      const s = stats.get(teamId);
      if (!s) continue;
      s.games++;
      s[side]++;
      if (slot) s[slot]++;
      const dates = gamesOn.get(teamId) ?? new Map<string, string[]>();
      dates.set(g.date, [...(dates.get(g.date) ?? []), g.id]);
      gamesOn.set(teamId, dates);
    }
  }

  // Byes: weeks with games in which the team has none.
  for (const week of weeks) {
    const playing = new Set(week.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
    for (const s of stats.values()) if (!playing.has(s.teamId)) s.byes++;
  }

  // Back-to-back: the same pair in two weeks running.
  const backToBack: FairnessIssue[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const before = new Map<string, ScheduleGame>();
    for (const g of weeks[i - 1] ?? []) {
      const key = pairKey(g.homeTeamId, g.awayTeamId);
      if (!before.has(key)) before.set(key, g);
    }
    const seen = new Set<string>();
    for (const g of weeks[i] ?? []) {
      const key = pairKey(g.homeTeamId, g.awayTeamId);
      const earlier = before.get(key);
      if (!earlier || seen.has(key) || g.homeTeamId === g.awayTeamId) continue;
      seen.add(key);
      const pair = byOrder(g.homeTeamId, g.awayTeamId);
      if (!known.has(pair[0]) && !known.has(pair[1])) continue;
      for (const id of pair) {
        const s = stats.get(id);
        if (s) s.backToBack++;
      }
      backToBack.push({
        rule: 'avoid-same-matchup-two-weeks-running',
        teamIds: pair,
        gameIds: [earlier.id, g.id],
      });
    }
  }

  const report = [...stats.values()];

  if (rules.noTeamTwiceInOneDay) {
    for (const t of teams) {
      for (const [date, gameIds] of gamesOn.get(t.id) ?? []) {
        if (gameIds.length > 1) {
          issues.push({
            rule: 'no-team-twice-in-one-day',
            teamId: t.id,
            date,
            gameIds: [...gameIds].sort(),
          });
        }
      }
    }
  }

  if (rules.spreadEarlyAndLateSlots && report.length > 1) {
    for (const slot of ['early', 'late'] as const) {
      const counts = report.map((s) => s[slot]);
      const fewest = Math.min(...counts);
      const most = Math.max(...counts);
      if (most - fewest <= 1) continue;
      for (const s of report) {
        if (s[slot] > fewest + 1 || s[slot] < most - 1) {
          issues.push({
            rule: 'spread-early-and-late-slots',
            teamId: s.teamId,
            slot,
            count: s[slot],
            fewest,
            most,
          });
        }
      }
    }
  }

  if (rules.balanceHomeAndAway) {
    for (const s of report) {
      if (Math.abs(s.home - s.away) > 1) {
        issues.push({
          rule: 'balance-home-and-away',
          teamId: s.teamId,
          home: s.home,
          away: s.away,
        });
      }
    }
  }

  if (rules.avoidSameMatchupTwoWeeksRunning) issues.push(...backToBack);

  if (rules.keepGamesWithinDivision) {
    for (const g of holding) {
      const home = known.get(g.homeTeamId);
      const away = known.get(g.awayTeamId);
      if (home && away && home.division !== away.division) {
        issues.push({
          rule: 'keep-games-within-division',
          gameId: g.id,
          teamIds: byOrder(g.homeTeamId, g.awayTeamId),
        });
      }
    }
  }

  const expected = input.timesEachPair;
  if (expected !== undefined && expected !== null) {
    const met = new Map<string, number>();
    for (const g of holding) {
      const key = pairKey(g.homeTeamId, g.awayTeamId);
      met.set(key, (met.get(key) ?? 0) + 1);
    }
    for (const [i, a] of teams.entries()) {
      for (const b of teams.slice(i + 1)) {
        if (input.withinDivisions === true && a.divisionId !== b.divisionId) continue;
        const actual = met.get(pairKey(a.id, b.id)) ?? 0;
        if (actual !== expected) {
          issues.push({ rule: 'times-each-pair', teamIds: [a.id, b.id], expected, actual });
        }
      }
    }
  }

  for (const { teamId, date } of input.unavailableDates ?? []) {
    for (const gameId of gamesOn.get(teamId)?.get(date) ?? []) {
      issues.push({ rule: 'team-unavailable-date', teamId, date, gameId });
    }
  }

  return { teams: report, issues };
}

function uniqueTeams(input: FairnessInput): FairnessInput['teams'] {
  const seen = new Set<string>();
  return input.teams.filter((t) => !seen.has(t.id) && seen.add(t.id));
}

/**
 * The games week by week, in date order: each round is a week. A game with no round joins the
 * round on its date (the round's own date first, else a round with games that day, the first
 * listed); only when no round falls on its date is it grouped by date as a week of its own.
 */
function weeksOf(input: FairnessInput, holding: readonly ScheduleGame[]): ScheduleGame[][] {
  const roundIndex = new Map(input.rounds.map((r, i) => [r.id, { round: r, index: i }]));
  // Which round a game with no round joins: the round dated that day, else the first-listed
  // round with games that day.
  const roundOn = new Map<string, string>(); // date → round id
  for (const r of input.rounds)
    if (r.date !== null && !roundOn.has(r.date)) roundOn.set(r.date, r.id);
  const listed = (id: string): number => roundIndex.get(id)?.index ?? input.rounds.length;
  const playedOn = new Map<string, string>(); // date → round id, from the games
  for (const g of holding) {
    if (g.roundId === null || roundOn.has(g.date)) continue;
    const other = playedOn.get(g.date);
    if (other === undefined || listed(g.roundId) < listed(other)) playedOn.set(g.date, g.roundId);
  }
  for (const [date, id] of playedOn) roundOn.set(date, id);
  const weeks = new Map<string, { games: ScheduleGame[]; date: string; index: number }>();
  for (const g of holding) {
    const roundId = g.roundId ?? roundOn.get(g.date) ?? null;
    const round = roundId === null ? undefined : roundIndex.get(roundId);
    const key = roundId === null ? `date:${g.date}` : `round:${roundId}`;
    const week = weeks.get(key) ?? {
      games: [],
      date: round?.round.date ?? g.date,
      index: round?.index ?? input.rounds.length,
    };
    week.games.push(g);
    if (!round?.round.date && g.date < week.date) week.date = g.date;
    weeks.set(key, week);
  }
  return [...weeks.values()]
    .sort((a, b) => (a.date === b.date ? a.index - b.index : a.date < b.date ? -1 : 1))
    .map((w) => w.games);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
