import { fairnessReport } from './fairness-report.ts';
import { findClashes } from './find-clashes.ts';
import { generatePairings } from './generate-pairings.ts';
import type { FairnessRules, Pairing } from './pairing-types.ts';
import type {
  PlacementError,
  PlacementInput,
  PlacementResult,
  SeasonCourt,
  StrictRule,
} from './placement-types.ts';
import type { ScheduleGame, ScheduleRound } from './schedule-types.ts';
import { seededOrder } from './seeded-order.ts';
import { dayNumber, maxSeasonDays, seasonWeeks, type SeasonWeek } from './season-weeks.ts';

/**
 * The rules the generator never breaks with a game it places, when switched on (team requests
 * always). Locked games are the admin's and are kept even when they break one. Besides these,
 * a placed game never clashes (a team in two places, a court booked twice, a skipped date).
 * Balancing home and away and spreading early and late slots are done as well as the season
 * allows, and the fairness report says where they fall short.
 */
export const strictRules: readonly StrictRule[] = [
  'no-team-twice-in-one-day',
  'avoid-same-matchup-two-weeks-running',
  'keep-games-within-division',
  'team-unavailable-date',
];

/**
 * A full schedule (P7 §4.1, §4.2; S-3): the pairings of `generatePairings` placed into the
 * season's dates, time slots and courts, with its fairness report. Pure and repeatable: the
 * same inputs give the same schedule.
 *
 * How the games are placed:
 * - The season is cut into weeks of seven days from its first date (`seasonWeeks`). Round 1 of
 *   the pairings goes into the first week with a playing date, round 2 into the next, and so
 *   on, so a week of the schedule is a round, as the fairness report counts it. Weeks whose
 *   dates are all skipped are passed over.
 * - Within a week, each game goes on a date neither team asked to miss, filling the week's
 *   dates evenly. On each date games take the earliest free times first, courts in the order
 *   given, and the games are arranged among those slots to share early and late ones out.
 * - With `spreadEarlyAndLateSlots` on, games on the same date then swap slots wherever that
 *   shares early and late slots out more evenly over the whole season. This is a search for a
 *   good arrangement, not a guarantee: some seasons cannot be evened out within one game, and
 *   the fairness report says so.
 * - A game that does not fit its week (no room, a team request, a locked game in the way, the
 *   same two teams in the week before or after) goes into the earliest week where it does fit
 *   without breaking a strict rule, using spare weeks at the end of the season. What fits
 *   nowhere is returned as unplaced, never forced in.
 * - Locked games stay exactly as they are, rounds included. Each locked game stands for one
 *   game of the pairings (the same two teams, the one meant for its week first), and the rest
 *   are placed around it. Every other game of `current` is replaced. A round of `current` is
 *   kept when a locked game is in it, and reused, name and all, for new games in its week.
 * - With `balanceHomeAndAway` on, home and away of placed games are swapped where that evens
 *   out a team that is more than one game off, which matters when locked or unplaced games
 *   have upset the pairings' own balance.
 */
export function placeSchedule(input: PlacementInput): PlacementResult {
  const checked = checkInput(input);
  if (!checked.ok) return checked;
  const { firstDay, lastDay, times, courts } = checked;
  const { rules } = input;
  const arrangement = input.arrangement ?? 0;

  const pairings = generatePairings({
    teams: input.teams,
    timesEachPair: input.timesEachPair,
    withinDivisions: rules.keepGamesWithinDivision,
    arrangement,
  });
  if (!pairings.ok) return pairings;

  const skipDates = new Set(input.skipDates ?? []);
  const weeks = seasonWeeks(firstDay, lastDay, new Set(input.playingDays), skipDates);
  const usable = weeks.flatMap((w, i) => (w.dates.length > 0 ? [i] : []));
  const weekOf = (date: string): number | null => {
    const day = dayNumber(date);
    if (day === null || day < firstDay || day > lastDay) return null;
    return Math.floor((day - firstDay) / 7);
  };

  const current = input.current ?? { rounds: [], games: [] };
  const lockedIds = new Set(input.lockedGameIds ?? []);
  const locked = current.games.filter((g) => lockedIds.has(g.id));

  // New games and rounds are numbered clear of every id in the current schedule.
  const gameId = nextId('game', new Set(current.games.map((g) => g.id)));
  const board = new Board(weeks, times, courts, rules, unavailableOf(input), gameId);
  for (const g of locked) {
    if (g.status === 'postponed' || g.status === 'cancelled') continue;
    board.addLocked(g, weekOf(g.date));
  }

  // The pairings as one list, each game knowing its round, less the games locked games stand for.
  const pool: Entry[] = [];
  for (const [round, r] of pairings.rounds.entries()) {
    for (const p of r.games) pool.push({ ...p, round, rank: 0 });
  }
  for (const [i, e] of seededOrder(pool, arrangement).entries()) e.rank = i;
  for (const g of locked) {
    const week = weekOf(g.date);
    const meantRound = week === null ? -1 : usable.indexOf(week);
    let best = -1;
    let bestScore = Infinity;
    for (const [i, e] of pool.entries()) {
      if (pairKey(e.homeTeamId, e.awayTeamId) !== pairKey(g.homeTeamId, g.awayTeamId)) continue;
      // Its own round first, then the same team at home, then the nearest round.
      const far = pairings.rounds.length + 2;
      const score =
        (e.round === meantRound ? 0 : 2 * far) +
        (e.homeTeamId === g.homeTeamId ? 0 : far) +
        Math.abs(e.round - meantRound);
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best >= 0) pool.splice(best, 1);
  }

  // Round by round into the weeks, then what did not fit into the earliest week it fits.
  const rounds = new Map<number, Entry[]>();
  for (const e of pool) rounds.set(e.round, [...(rounds.get(e.round) ?? []), e]);
  let leftovers: Entry[] = [];
  for (const [round, entries] of rounds) {
    const week = usable[round];
    if (week === undefined) leftovers.push(...entries);
    else leftovers.push(...board.placeInto(week, entries, false));
  }
  leftovers.sort((a, b) => a.round - b.round || a.rank - b.rank);
  for (const twiceInWeek of [false, true]) {
    const still: Entry[] = [];
    for (const e of leftovers) {
      if (!usable.some((week) => board.placeInto(week, [e], twiceInWeek).length === 0)) {
        still.push(e);
      }
    }
    leftovers = still;
  }

  const placed = board.placed;
  const lockedRoundIds = new Set(locked.flatMap((g) => (g.roundId === null ? [] : [g.roundId])));
  const roundId = nextId('round', new Set(current.rounds.map((r) => r.id)));
  const newRoundIds = new Map<number, string>(); // week → id, kept across the clean-up passes
  const build = (alive: readonly Placed[]): { rounds: ScheduleRound[]; games: ScheduleGame[] } => {
    const weeksUsed = [...new Set(alive.map((p) => p.week))].sort((a, b) => a - b);
    const keptRounds = new Map<string, ScheduleRound>();
    for (const r of current.rounds) if (lockedRoundIds.has(r.id)) keptRounds.set(r.id, r);
    const fresh: { id: string; date: string }[] = [];
    const roundOfWeek = new Map<number, string>();
    for (const week of weeksUsed) {
      const first = weeks[week]?.firstDay ?? 0;
      const inWeek = (date: string | null): boolean => {
        const day = date === null ? null : dayNumber(date);
        return day !== null && day >= first && day < first + 7;
      };
      // A locked game's round in this week, else a round of the current schedule dated in it.
      const lockedRound = current.rounds.find(
        (r) => lockedRoundIds.has(r.id) && locked.some((g) => g.roundId === r.id && inWeek(g.date)),
      );
      const datedRound = current.rounds.find(
        (r) => !keptRounds.has(r.id) && !lockedRoundIds.has(r.id) && inWeek(r.date),
      );
      const kept = lockedRound ?? datedRound;
      if (kept) {
        keptRounds.set(kept.id, kept);
        roundOfWeek.set(week, kept.id);
        continue;
      }
      const id = newRoundIds.get(week) ?? roundId();
      newRoundIds.set(week, id);
      const dates = alive.filter((p) => p.week === week).map((p) => p.date);
      fresh.push({ id, date: dates.sort()[0] ?? '' });
      roundOfWeek.set(week, id);
    }
    const ordered = [
      ...[...keptRounds.values()].map((r) => ({ round: r, fresh: false })),
      ...fresh.map((f) => ({ round: { id: f.id, label: '', date: f.date }, fresh: true })),
    ].sort((a, b) => compareDates(a.round.date, b.round.date));
    const rounds = ordered.map(({ round, fresh: isNew }, i) =>
      isNew ? { ...round, label: input.roundLabel(i + 1) } : round,
    );
    const games: ScheduleGame[] = [
      ...locked,
      ...alive.map(
        (p): ScheduleGame => ({
          id: p.id,
          roundId: roundOfWeek.get(p.week) ?? null,
          date: p.date,
          time: p.time,
          venueId: p.venueId,
          court: p.court,
          homeTeamId: p.homeTeamId,
          awayTeamId: p.awayTeamId,
          status: 'scheduled',
        }),
      ),
    ];
    const courtOrder = new Map(courts.map((c, i) => [courtKey(c), i]));
    const position = (g: ScheduleGame): number =>
      courtOrder.get(courtKey({ venueId: g.venueId, court: g.court ?? '' })) ?? courts.length;
    games.sort(
      (a, b) =>
        compareDates(a.date, b.date) ||
        compareDates(a.time, b.time) ||
        position(a) - position(b) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return { rounds, games };
  };

  const reportOf = (schedule: { rounds: ScheduleRound[]; games: ScheduleGame[] }) =>
    fairnessReport({
      teams: input.teams,
      rounds: schedule.rounds,
      games: schedule.games,
      rules,
      timesEachPair: input.timesEachPair,
      withinDivisions: rules.keepGamesWithinDivision,
      unavailableDates: input.unavailableDates ?? [],
    });

  // Clean-up: the fairness report and the clash check are the judges. A placed game named in
  // a strict issue or a clash is taken out (the later one, when two placed games are named),
  // until none is. The placing above avoids nearly all of these; this makes it certain.
  let alive = placed;
  const unplaced: Pairing[] = leftovers.map((e) => ({
    homeTeamId: e.homeTeamId,
    awayTeamId: e.awayTeamId,
  }));
  for (;;) {
    const schedule = build(alive);
    const order = new Map(alive.map((p, i) => [p.id, i]));
    const latest = (ids: readonly string[]): string[] => {
      const mine = ids.filter((id) => order.has(id));
      mine.sort((a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0));
      return mine.slice(0, 1);
    };
    const out = new Set<string>();
    for (const issue of reportOf(schedule).issues) {
      if (issue.rule === 'no-team-twice-in-one-day')
        latest(issue.gameIds).forEach((id) => out.add(id));
      if (issue.rule === 'avoid-same-matchup-two-weeks-running') {
        latest(issue.gameIds).forEach((id) => out.add(id));
      }
      if (issue.rule === 'team-unavailable-date' || issue.rule === 'keep-games-within-division') {
        latest([issue.gameId]).forEach((id) => out.add(id));
      }
    }
    for (const clash of findClashes(schedule.games, [...skipDates])) {
      latest(clash.kind === 'skipped-date' ? [clash.gameId] : clash.gameIds).forEach((id) =>
        out.add(id),
      );
    }
    if (out.size === 0) break;
    for (const p of alive) {
      if (out.has(p.id)) unplaced.push({ homeTeamId: p.homeTeamId, awayTeamId: p.awayTeamId });
    }
    alive = alive.filter((p) => !out.has(p.id));
  }

  if (rules.spreadEarlyAndLateSlots) alive = spreadEarlyAndLate(alive, locked);
  if (rules.balanceHomeAndAway) alive = balanceHomeAndAway(alive, locked);
  const schedule = build(alive);
  return { ok: true, ...schedule, unplaced, report: reportOf(schedule) };
}

/** A game of the pairings waiting for a place: its round, and its turn in the seeded order. */
type Entry = Pairing & { round: number; rank: number };

/** A game the generator placed. */
type Placed = Pairing & {
  id: string;
  week: number;
  date: string;
  time: string;
  venueId: string | null;
  court: string;
};

type Slot = { time: string; venueId: string | null; court: string };

/** What is booked so far: courts, teams, pairs per week and early and late slots per team. */
class Board {
  readonly placed: Placed[] = [];
  private readonly booked = new Set<string>();
  /** team → date → times (null for a locked game with no time) */
  private readonly teamOn = new Map<string, Map<string, Set<string | null>>>();
  /** week → team ids */
  private readonly teamsInWeek = new Map<number, Set<string>>();
  /** week → pairs, by pair key */
  private readonly pairsInWeek = new Map<number, Set<string>>();
  private readonly early = new Map<string, number>();
  private readonly late = new Map<string, number>();

  constructor(
    private readonly weeks: readonly SeasonWeek[],
    private readonly times: readonly string[],
    private readonly courts: readonly SeasonCourt[],
    private readonly rules: FairnessRules,
    private readonly unavailable: ReadonlyMap<string, ReadonlySet<string>>,
    private readonly newId: () => string,
  ) {}

  addLocked(g: ScheduleGame, week: number | null): void {
    if (g.time !== null && g.court !== null) {
      this.booked.add(slotKey(g.date, { time: g.time, venueId: g.venueId, court: g.court }));
    }
    this.book(g, week, g.date, g.time);
  }

  /**
   * Places the games into the week. Returns those it could not place. Without `twiceInWeek`
   * a team already playing that week is not given a second game in it.
   */
  placeInto(week: number, entries: readonly Entry[], twiceInWeek: boolean): Entry[] {
    const dates = this.weeks[week]?.dates ?? [];
    const failed: Entry[] = [];
    // A pair never meets twice in one week; nor in weeks running, with that rule on.
    const busyPairs = [
      this.pairsInWeek.get(week),
      ...(this.rules.avoidSameMatchupTwoWeeksRunning ? this.neighbours(week) : []),
    ];
    const choices: { entry: Entry; allowed: string[] }[] = [];
    for (const e of entries) {
      const key = pairKey(e.homeTeamId, e.awayTeamId);
      const teams = [e.homeTeamId, e.awayTeamId];
      const sameWeek = this.teamsInWeek.get(week);
      if (
        busyPairs.some((pairs) => pairs?.has(key)) ||
        (!twiceInWeek && teams.some((t) => sameWeek?.has(t)))
      ) {
        failed.push(e);
        continue;
      }
      const allowed = dates.filter(
        (d) =>
          teams.every((t) => !this.unavailable.get(t)?.has(d)) &&
          (!this.rules.noTeamTwiceInOneDay || teams.every((t) => !this.teamOn.get(t)?.has(d))) &&
          this.freeSlots(d).length > 0,
      );
      if (allowed.length === 0) failed.push(e);
      else choices.push({ entry: e, allowed });
    }

    // The most constrained games choose first; each takes the date least full so far.
    choices.sort((a, b) => a.allowed.length - b.allowed.length || a.entry.rank - b.entry.rank);
    const onDate = new Map<string, Entry[]>(dates.map((d) => [d, []]));
    for (const { entry, allowed } of choices) {
      let best: string | undefined;
      let bestLoad = Infinity;
      for (const d of allowed) {
        const there = onDate.get(d) ?? [];
        const room = this.freeSlots(d).length;
        if (there.length >= room) continue;
        if (this.rules.noTeamTwiceInOneDay && there.some((o) => sharesTeam(o, entry))) continue;
        const load = there.length / room;
        if (load < bestLoad) {
          best = d;
          bestLoad = load;
        }
      }
      if (best === undefined) failed.push(entry);
      else onDate.get(best)?.push(entry);
    }
    for (const [date, list] of onDate) {
      if (list.length > 0) failed.push(...this.placeOnDate(week, date, list));
    }
    return failed;
  }

  /** Gives each game a time and court on the date: earliest times first, early and late shared out. */
  private placeOnDate(week: number, date: string, list: readonly Entry[]): Entry[] {
    const chosen = this.freeSlots(date).slice(0, list.length);
    const used = [...chosen.map((s) => s.time), ...this.timesOn(date)].sort();
    const earliest = used[0];
    const latest = used[used.length - 1];
    const kind = (time: string): 'early' | 'late' | 'middle' =>
      earliest === latest
        ? 'middle'
        : time === earliest
          ? 'early'
          : time === latest
            ? 'late'
            : 'middle';
    const timeAt = (i: number): string => chosen[i]?.time ?? '';

    // First each game, in the seeded order, takes the first slot it can play in.
    const plan: (Entry | undefined)[] = chosen.map(() => undefined);
    const fits = (e: Entry, i: number): boolean =>
      this.canPlay(e, date, timeAt(i)) &&
      plan.every((o, j) => j === i || !o || timeAt(j) !== timeAt(i) || !sharesTeam(o, e));
    const rest: Entry[] = [];
    for (const e of [...list].sort((a, b) => a.rank - b.rank)) {
      const i = plan.findIndex((o, j) => !o && fits(e, j));
      if (i < 0) rest.push(e);
      else plan[i] = e;
    }

    // Then games swap slots while that evens out early and late slots: the sum of the squares
    // of each team's early and late counts falls with every swap kept, so it ends.
    const teams = [...new Set(list.flatMap((e) => [e.homeTeamId, e.awayTeamId]))];
    const cost = (): number => {
      const early = new Map(teams.map((t) => [t, this.early.get(t) ?? 0]));
      const late = new Map(teams.map((t) => [t, this.late.get(t) ?? 0]));
      plan.forEach((e, i) => {
        const k = kind(timeAt(i));
        if (!e || k === 'middle') return;
        const m = k === 'early' ? early : late;
        for (const t of [e.homeTeamId, e.awayTeamId]) m.set(t, (m.get(t) ?? 0) + 1);
      });
      let sum = 0;
      for (const t of teams) sum += (early.get(t) ?? 0) ** 2 + (late.get(t) ?? 0) ** 2;
      return sum;
    };
    let best = cost();
    for (let improved = true; improved; ) {
      improved = false;
      for (let i = 0; i < plan.length; i++) {
        for (let j = i + 1; j < plan.length; j++) {
          if (kind(timeAt(i)) === kind(timeAt(j))) continue;
          const a = plan[i];
          const b = plan[j];
          plan[i] = b;
          plan[j] = a;
          const ok = (!b || fits(b, i)) && (!a || fits(a, j));
          const now = ok ? cost() : Infinity;
          if (now < best) {
            best = now;
            improved = true;
          } else {
            plan[i] = a;
            plan[j] = b;
          }
        }
      }
    }
    plan.forEach((e, i) => {
      const slot = chosen[i];
      if (e && slot) this.add(e, week, date, slot, kind(slot.time));
    });

    const failed: Entry[] = [];
    for (const e of rest) {
      const slot = this.freeSlots(date).find((s) => this.canPlay(e, date, s.time));
      if (!slot) failed.push(e);
      else this.add(e, week, date, slot, null);
    }
    return failed;
  }

  private canPlay(e: Entry, date: string, time: string): boolean {
    return [e.homeTeamId, e.awayTeamId].every((t) => !this.teamOn.get(t)?.get(date)?.has(time));
  }

  private add(
    e: Entry,
    week: number,
    date: string,
    slot: Slot,
    k: 'early' | 'late' | 'middle' | null,
  ): void {
    this.booked.add(slotKey(date, slot));
    this.book(e, week, date, slot.time);
    if (k === 'early' || k === 'late') {
      const m = k === 'early' ? this.early : this.late;
      for (const t of [e.homeTeamId, e.awayTeamId]) m.set(t, (m.get(t) ?? 0) + 1);
    }
    this.placed.push({
      id: this.newId(),
      homeTeamId: e.homeTeamId,
      awayTeamId: e.awayTeamId,
      week,
      date,
      time: slot.time,
      venueId: slot.venueId,
      court: slot.court,
    });
  }

  private book(g: Pairing, week: number | null, date: string, time: string | null): void {
    for (const t of new Set([g.homeTeamId, g.awayTeamId])) {
      const dates = this.teamOn.get(t) ?? new Map<string, Set<string | null>>();
      const at = dates.get(date) ?? new Set<string | null>();
      at.add(time);
      dates.set(date, at);
      this.teamOn.set(t, dates);
      if (week !== null) {
        const teams = this.teamsInWeek.get(week) ?? new Set<string>();
        teams.add(t);
        this.teamsInWeek.set(week, teams);
      }
    }
    if (week !== null) {
      const pairs = this.pairsInWeek.get(week) ?? new Set<string>();
      pairs.add(pairKey(g.homeTeamId, g.awayTeamId));
      this.pairsInWeek.set(week, pairs);
    }
  }

  /** The pairs of the nearest weeks before and after that have games. */
  private neighbours(week: number): (Set<string> | undefined)[] {
    const out: (Set<string> | undefined)[] = [];
    for (let w = week - 1; w >= 0; w--) {
      if (this.pairsInWeek.has(w)) {
        out.push(this.pairsInWeek.get(w));
        break;
      }
    }
    for (let w = week + 1; w < this.weeks.length; w++) {
      if (this.pairsInWeek.has(w)) {
        out.push(this.pairsInWeek.get(w));
        break;
      }
    }
    return out;
  }

  /** The date's free slots, earliest time first, courts in the order given. */
  private freeSlots(date: string): Slot[] {
    const out: Slot[] = [];
    for (const time of this.times) {
      for (const c of this.courts) {
        const slot = { time, venueId: c.venueId, court: c.court };
        if (!this.booked.has(slotKey(date, slot))) out.push(slot);
      }
    }
    return out;
  }

  /** The times already taken on the date, by any game. */
  private timesOn(date: string): string[] {
    const out = new Set<string>();
    for (const dates of this.teamOn.values()) {
      for (const t of dates.get(date) ?? []) if (t !== null) out.add(t);
    }
    return [...out];
  }
}

/**
 * Swaps the slots of two placed games on the same date, one early or late and the other not
 * (or the other way), while that shares early and late slots out more evenly over the season.
 * "More evenly" is the sum over teams of (early² + late²) ÷ games, which is smallest when each
 * team's early and late slots are in proportion to its games, as the fairness report compares
 * them. Every swap kept lowers it, so it ends. Which times are early and late on a date does
 * not change, since the same times stay in use.
 */
function spreadEarlyAndLate(alive: readonly Placed[], locked: readonly ScheduleGame[]): Placed[] {
  const out = alive.map((p) => ({ ...p }));
  const all: (Pairing & { date: string; time: string | null })[] = [
    ...locked.filter((g) => g.status !== 'postponed' && g.status !== 'cancelled'),
    ...out,
  ];
  const timesOn = new Map<string, string[]>();
  for (const g of all) {
    if (g.time !== null) timesOn.set(g.date, [...(timesOn.get(g.date) ?? []), g.time]);
  }
  const ends = new Map<string, [string, string]>(); // date → earliest and latest time
  for (const [date, list] of timesOn) {
    const times = [...new Set(list)].sort();
    if (times.length >= 2) ends.set(date, [times[0] ?? '', times[times.length - 1] ?? '']);
  }
  const kindOf = (date: string, time: string): 'early' | 'late' | 'middle' => {
    const [earliest, latest] = ends.get(date) ?? [];
    return time === earliest ? 'early' : time === latest ? 'late' : 'middle';
  };

  const games = new Map<string, number>();
  const tally = { early: new Map<string, number>(), late: new Map<string, number>() };
  const busy = new Set<string>(); // team, date and time, as a key
  const bump = (m: Map<string, number>, t: string, by: number): void => {
    m.set(t, (m.get(t) ?? 0) + by);
  };
  for (const g of all) {
    const kind = g.time === null ? 'middle' : kindOf(g.date, g.time);
    for (const t of [g.homeTeamId, g.awayTeamId]) {
      bump(games, t, 1);
      if (kind !== 'middle') bump(tally[kind], t, 1);
      if (g.time !== null) busy.add(JSON.stringify([t, g.date, g.time]));
    }
  }
  const costOf = (teams: readonly string[]): number => {
    let sum = 0;
    for (const t of teams) {
      const e = tally.early.get(t) ?? 0;
      const l = tally.late.get(t) ?? 0;
      sum += (e * e + l * l) / Math.max(1, games.get(t) ?? 0);
    }
    return sum;
  };
  const book = (p: Placed, time: string, by: 1 | -1): void => {
    const kind = kindOf(p.date, time);
    for (const t of [p.homeTeamId, p.awayTeamId]) {
      if (kind !== 'middle') bump(tally[kind], t, by);
      const key = JSON.stringify([t, p.date, time]);
      if (by === 1) busy.add(key);
      else busy.delete(key);
    }
  };

  /** Each game takes the next one's slot, the last the first's; kept only if it evens things out. */
  const rotate = (ring: readonly Placed[]): boolean => {
    const slots = ring.map((p) => ({ time: p.time, venueId: p.venueId, court: p.court }));
    const next = (i: number): (typeof slots)[number] =>
      slots[(i + 1) % ring.length] ?? { time: '', venueId: null, court: '' };
    const teams = ring.flatMap((p) => [p.homeTeamId, p.awayTeamId]);
    const before = costOf(teams);
    ring.forEach((p) => book(p, p.time, -1));
    const free = ring.every((p, i) =>
      [p.homeTeamId, p.awayTeamId].every(
        (t) => !busy.has(JSON.stringify([t, p.date, next(i).time])),
      ),
    );
    ring.forEach((p, i) => book(p, free ? next(i).time : p.time, 1));
    if (free && costOf(teams) < before - 1e-9) {
      ring.forEach((p, i) => Object.assign(p, next(i)));
      return true;
    }
    if (free) {
      ring.forEach((p, i) => book(p, next(i).time, -1));
      ring.forEach((p) => book(p, p.time, 1));
    }
    return false;
  };

  // Swaps of two games, and turns of three (early to middle to late to early, and back).
  const byDate = new Map<string, Placed[]>();
  for (const p of out) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  for (let improved = true; improved; ) {
    improved = false;
    for (const list of byDate.values()) {
      const kind = (p: Placed): string => kindOf(p.date, p.time);
      for (const [i, a] of list.entries()) {
        for (const [j, b] of list.entries()) {
          if (j <= i || kind(a) === kind(b) || sharesTeam(a, b)) continue;
          if (rotate([a, b])) {
            improved = true;
            continue;
          }
          for (const c of list.slice(j + 1)) {
            if (kind(c) === kind(a) || kind(c) === kind(b)) continue;
            if (sharesTeam(a, c) || sharesTeam(b, c)) continue;
            if (rotate([a, b, c]) || rotate([a, c, b])) improved = true;
          }
        }
      }
    }
  }
  return out;
}

/**
 * Swaps home and away of placed games while that brings a team more than one game off back
 * towards even, without pushing the other team further off. Each swap evens out both teams,
 * so it ends.
 */
function balanceHomeAndAway(alive: readonly Placed[], locked: readonly ScheduleGame[]): Placed[] {
  const out = [...alive];
  const lean = new Map<string, number>(); // home games less away games
  const count = (g: Pairing, by: number): void => {
    lean.set(g.homeTeamId, (lean.get(g.homeTeamId) ?? 0) + by);
    lean.set(g.awayTeamId, (lean.get(g.awayTeamId) ?? 0) - by);
  };
  for (const g of locked) if (g.status !== 'postponed' && g.status !== 'cancelled') count(g, 1);
  for (const p of out) count(p, 1);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [i, p] of out.entries()) {
      const home = lean.get(p.homeTeamId) ?? 0;
      const away = lean.get(p.awayTeamId) ?? 0;
      // Swapping moves home down two and away up two: the sum of the squares of every team's
      // lean falls exactly when home leans more than two further than away, so this ends.
      if (home - away > 2) {
        count(p, -1);
        const swapped = { ...p, homeTeamId: p.awayTeamId, awayTeamId: p.homeTeamId };
        count(swapped, 1);
        out[i] = swapped;
        changed = true;
      }
    }
  }
  return out;
}

type Checked =
  | { ok: true; firstDay: number; lastDay: number; times: string[]; courts: SeasonCourt[] }
  | { ok: false; error: PlacementError };

function checkInput(input: PlacementInput): Checked {
  const fail = (error: PlacementError): Checked => ({ ok: false, error });
  const firstDay = dayNumber(input.firstDate);
  if (firstDay === null) return fail({ code: 'invalid-date', value: input.firstDate });
  const lastDay = dayNumber(input.lastDate);
  if (lastDay === null) return fail({ code: 'invalid-date', value: input.lastDate });
  if (lastDay < firstDay) {
    return fail({
      code: 'season-ends-before-it-starts',
      firstDate: input.firstDate,
      lastDate: input.lastDate,
    });
  }
  if (lastDay - firstDay + 1 > maxSeasonDays) {
    return fail({ code: 'season-too-long', days: lastDay - firstDay + 1 });
  }
  for (const date of [
    ...(input.skipDates ?? []),
    ...(input.unavailableDates ?? []).map((u) => u.date),
  ]) {
    if (dayNumber(date) === null) return fail({ code: 'invalid-date', value: date });
  }
  if (input.playingDays.length === 0) return fail({ code: 'no-playing-days' });
  for (const day of input.playingDays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      return fail({ code: 'invalid-playing-day', value: day });
    }
  }
  if (input.times.length === 0) return fail({ code: 'no-times' });
  for (const time of input.times) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail({ code: 'invalid-time', value: time });
  }
  if (input.courts.length === 0) return fail({ code: 'no-courts' });
  if (input.courts.some((c) => c.court.trim() === '')) return fail({ code: 'empty-court-name' });
  const ids = new Set((input.current?.games ?? []).map((g) => g.id));
  for (const id of input.lockedGameIds ?? []) {
    if (!ids.has(id)) return fail({ code: 'unknown-locked-game', gameId: id });
  }
  const seen = new Set<string>();
  const courts = input.courts.filter((c) => !seen.has(courtKey(c)) && seen.add(courtKey(c)));
  return { ok: true, firstDay, lastDay, times: [...new Set(input.times)].sort(), courts };
}

/** Ids `prefix-1`, `prefix-2` and on, skipping those taken. */
function nextId(prefix: string, taken: Set<string>): () => string {
  let n = 0;
  return () => {
    let id: string;
    do id = `${prefix}-${++n}`;
    while (taken.has(id));
    taken.add(id);
    return id;
  };
}

function unavailableOf(input: PlacementInput): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { teamId, date } of input.unavailableDates ?? []) {
    out.set(teamId, (out.get(teamId) ?? new Set<string>()).add(date));
  }
  return out;
}

function sharesTeam(a: Pairing, b: Pairing): boolean {
  return [a.homeTeamId, a.awayTeamId].some((t) => t === b.homeTeamId || t === b.awayTeamId);
}

function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function pairKey(a: string, b: string): string {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

function courtKey(c: SeasonCourt): string {
  return JSON.stringify([c.venueId, c.court]);
}

function slotKey(date: string, s: Slot): string {
  return JSON.stringify([date, s.time, s.venueId, s.court]);
}
