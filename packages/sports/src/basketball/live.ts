/**
 * Live basketball stat tracker engine. Pure: no DOM, no network, no timers.
 *
 * Shared by the server, which applies every accepted command and saves the
 * result, and the scorer's browser, which applies the same commands before the
 * server answers so a tap shows at once and survives a dropped connection. The
 * server sends this file to the browser with its types stripped, so it must stay
 * self-contained: no runtime imports and only erasable TypeScript syntax.
 *
 * Modelled on the Faraj League tracker. The effective plays are an ordered list
 * and everything shown (score, fouls, who is on the floor, minutes) is derived
 * from it. Undo moves the last play onto a redo stack rather than editing a
 * running total, so it can never drift from what is displayed. The game clock
 * is anchored to a timestamp while it runs, so a sleeping tablet never stops
 * game time, and minutes are credited from the cumulative running time stamped
 * on each play. Under a stop clock, a foul or a timeout stops a running clock,
 * as the officials' whistle does (NFHS 5-8-1); only the scorer starts it again.
 * Under a running clock they do not. The scorer can switch between the two at
 * any moment of the game (S-21, T-128).
 *
 * Three more rules, each off when the format leaves it out (step 2.67): a stop
 * clock in the last seconds of a period, a half or the game, which a foul or a
 * timeout stops even under a running clock; a mercy lead, at which a basket
 * switches a stop clock to a running clock; and a personal foul limit, at which
 * a player is marked out. The scorer's own switch overrides the first two.
 */

export type Side = 'home' | 'away';
export const SIDES: readonly Side[] = ['home', 'away'];
export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home');

/** Stop: a foul or a timeout stops the clock. Running: the clock keeps going through them. */
export type ClockMode = 'stop' | 'running';
export const CLOCK_MODES: readonly ClockMode[] = ['stop', 'running'];

/** Where a last-minutes stop clock applies: the end of every period, of each half, or of the game. */
export type StopClockScope = 'period' | 'half' | 'game';
export const STOP_CLOCK_SCOPES: readonly StopClockScope[] = ['period', 'half', 'game'];

export type Rules = {
  /** Regulation periods: 2 halves or 4 quarters. */
  periods: 2 | 4;
  periodSeconds: number;
  overtimeSeconds: number;
  /** Team fouls in a period that put the other team in the bonus. */
  bonusFouls: number;
  /** Team fouls for the double bonus, or null when the format has none. */
  doubleBonusFouls: number | null;
  // Timeouts each team may take. Games saved before timeouts were tracked have none
  // of these; read them through `timeoutRules`, which fills in TCSAAL's.
  /** 60-second ("full") timeouts per game or per half. */
  fullTimeouts?: number;
  /** 30-second timeouts per game or per half. */
  shortTimeouts?: number;
  timeoutsPer?: 'game' | 'half';
  /** 60-second timeouts added for each overtime period. */
  overtimeTimeouts?: number;
  /** Whether unused timeouts carry into the next half or overtime. */
  timeoutsCarry?: boolean;
  /**
   * The clock the game starts with. Absent means a stop clock, which is how every
   * game saved before the mode existed was played; read it through `clockModeOf`.
   */
  clockMode?: ClockMode;
  // The three rules below are off when absent or null, as in every game saved before them.
  /**
   * A stop clock in the last seconds of the scope: there a foul or a timeout stops
   * the clock even under a running clock. Each overtime period counts, whatever the
   * scope, since any of them can end the game. Read through `inLastMinutes`.
   */
  stopClockLastSeconds?: number | null;
  /** Where those last seconds are. Absent means each half. */
  stopClockScope?: StopClockScope;
  /** A lead at which a basket switches a stop clock to a running clock. */
  mercyLead?: number | null;
  /** Personal fouls that mark a player out (`Line.fouledOut`). */
  playerFoulLimit?: number | null;
};
export type TimeoutRules = Required<
  Pick<
    Rules,
    'fullTimeouts' | 'shortTimeouts' | 'timeoutsPer' | 'overtimeTimeouts' | 'timeoutsCarry'
  >
>;

/**
 * TCSAAL's timeouts (2025–26 basketball rules): three 60-second and two 30-second
 * a game, one 60-second for each overtime, and none carried into overtime or from
 * one overtime to the next.
 */
const TCSAAL_TIMEOUTS: TimeoutRules = {
  fullTimeouts: 3,
  shortTimeouts: 2,
  timeoutsPer: 'game',
  overtimeTimeouts: 1,
  timeoutsCarry: false,
};

/**
 * TCSAAL varsity, which plays NFHS rules: 8-minute quarters and 4-minute overtime,
 * team fouls reset each quarter, the bonus on the 5th; TCSAAL's timeouts.
 */
export const QUARTERS: Rules = {
  periods: 4,
  periodSeconds: 8 * 60,
  overtimeSeconds: 4 * 60,
  bonusFouls: 5,
  doubleBonusFouls: null,
  ...TCSAAL_TIMEOUTS,
};
/**
 * UIL, which plays NFHS rules as written: as TCSAAL, except unused timeouts carry
 * into overtime (NFHS 5-11-1).
 */
export const NFHS_QUARTERS: Rules = { ...QUARTERS, timeoutsCarry: true };
/**
 * Rec-league format, as Faraj League plays it: 20-minute halves, bonus on 7, double
 * on 10. Two timeouts a half and one each overtime, none carried over: common in rec
 * leagues; confirm with the league.
 */
export const HALVES: Rules = {
  periods: 2,
  periodSeconds: 20 * 60,
  overtimeSeconds: 5 * 60,
  bonusFouls: 7,
  doubleBonusFouls: 10,
  fullTimeouts: 2,
  shortTimeouts: 0,
  timeoutsPer: 'half',
  overtimeTimeouts: 1,
  timeoutsCarry: false,
};
export const DEFAULT_RULES = QUARTERS;

/** A format's timeouts, with TCSAAL's for a game saved before timeouts were tracked. */
export function timeoutRules(rules: Rules): TimeoutRules {
  return {
    fullTimeouts: rules.fullTimeouts ?? TCSAAL_TIMEOUTS.fullTimeouts,
    shortTimeouts: rules.shortTimeouts ?? TCSAAL_TIMEOUTS.shortTimeouts,
    timeoutsPer: rules.timeoutsPer ?? TCSAAL_TIMEOUTS.timeoutsPer,
    overtimeTimeouts: rules.overtimeTimeouts ?? TCSAAL_TIMEOUTS.overtimeTimeouts,
    timeoutsCarry: rules.timeoutsCarry ?? TCSAAL_TIMEOUTS.timeoutsCarry,
  };
}

/** The clock mode a format starts the game with: a stop clock unless it says otherwise. */
export const clockModeOf = (rules: Rules): ClockMode =>
  rules.clockMode === 'running' ? 'running' : 'stop';

/**
 * Is `remainingMs` in `period` inside the format's last-minutes stop clock? Each
 * half ends at the middle and the last regulation period (Q2 and Q4, or H1 and
 * H2); each overtime period is always in scope.
 */
export function inLastMinutes(rules: Rules, period: number, remainingMs: number): boolean {
  const seconds = rules.stopClockLastSeconds;
  if (seconds == null || remainingMs > seconds * 1000) return false;
  if (period > rules.periods) return true;
  const scope = rules.stopClockScope ?? 'half';
  if (scope === 'period') return true;
  if (scope === 'game') return period === rules.periods;
  return period === rules.periods || period === rules.periods / 2;
}

/**
 * The clock mode in force at `remainingMs` of the current period: what the format,
 * the mercy rule or the scorer chose (`Derived.clockMode`), except that inside the
 * last-minutes stop clock it is a stop clock, unless the scorer switched to a
 * running clock there themselves (S-21: the scorer overrides anything automatic).
 * The tracker's switch shows this mode, and a foul or a timeout follows it.
 */
export function clockModeAt(
  state: GameState,
  d: Derived = derive(state),
  remainingMs: number = state.clock.remainingMs,
): ClockMode {
  if (d.clockMode === 'stop') return 'stop';
  if (!inLastMinutes(state.rules, d.period, remainingMs)) return 'running';
  for (let i = state.plays.length - 1; i >= 0; i--) {
    const p = state.plays[i]!;
    // The mercy rule's switch is automatic, so the stop clock still holds after it.
    if (p.mercyClock) break;
    if (p.type === 'clock-mode')
      return p.period === d.period && inLastMinutes(state.rules, p.period, p.clockMs)
        ? 'running'
        : 'stop';
  }
  return 'stop';
}

/** Players on the floor per team. */
export const LINEUP_SIZE = 5;
const MAX_PERIOD = 20;
const MAX_CLOCK_MS = 60 * 60 * 1000;
/** Command ids kept on the state so a device can drop queued work the server already took. */
const RECENT_LIMIT = 300;

export type Play =
  | { type: 'lineup'; side: Side; playerIds: string[] }
  | { type: 'score'; side: Side; playerId: string; points: 1 | 2 | 3 }
  | { type: 'foul'; side: Side; playerId: string }
  | { type: 'unfoul'; side: Side; playerId: string }
  | { type: 'turnover'; side: Side; playerId: string }
  | { type: 'unturnover'; side: Side; playerId: string }
  /** A turnover charged to the team rather than a player, such as a shot-clock violation. */
  | { type: 'team-turnover'; side: Side }
  | { type: 'team-unturnover'; side: Side }
  /** A charged timeout, 60 or 30 seconds. It stops a running clock. */
  | { type: 'timeout'; side: Side; seconds: 60 | 30 }
  /** Takes back the team's latest timeout, recorded by mistake. */
  | { type: 'untimeout'; side: Side }
  | { type: 'sub'; side: Side; inId: string; outId: string }
  | { type: 'period'; period: number }
  /** The scorer switches the clock mode mid-game, whatever the format says (S-21). */
  | { type: 'clock-mode'; mode: ClockMode };

/** Plays that stop a running clock under a stop clock, as the officials' whistle does. */
const STOPS_CLOCK: ReadonlySet<Play['type']> = new Set(['foul', 'timeout']);

export type Command =
  | Play
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'set-clock'; ms: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'rules'; rules: Rules }
  | { type: 'colors'; swapped: boolean }
  | { type: 'end' }
  | { type: 'reopen' }
  | { type: 'reset' };

/** When a play happened: game period and clock, and cumulative running time for minutes. */
export type Stamp = {
  id: string;
  at: number;
  period: number;
  clockMs: number;
  elapsedMs: number;
  /** On a period change, the clock it replaced, so undoing the change puts it back. */
  prevClockMs?: number;
  /** This play stopped the running clock (a foul or a timeout under a stop clock). */
  stoppedClock?: true;
  /**
   * This basket brought the lead up to the mercy rule's and switched a stop clock to
   * a running clock. The tracker says so; undoing the basket undoes the switch.
   */
  mercyClock?: true;
};
export type LoggedPlay = Play & Stamp;

export type Clock = {
  remainingMs: number;
  running: boolean;
  /** While running, the moment `remainingMs` and `elapsedMs` were last brought up to date. */
  anchorAt: number;
  /** Cumulative time the clock has run across every period: what minutes are measured in. */
  elapsedMs: number;
};

export type GameState = {
  version: 1;
  status: 'scheduled' | 'live' | 'final';
  rules: Rules;
  clock: Clock;
  plays: LoggedPlay[];
  redo: LoggedPlay[];
  /** Home is shown in light jerseys and away in dark unless swapped. */
  colorsSwapped: boolean;
  recent: string[];
  /** Time of the last applied command; later commands never run the clock backwards. */
  lastAt: number;
};

export type Line = {
  side: Side;
  points: number;
  fg1: number;
  fg2: number;
  fg3: number;
  fouls: number;
  turnovers: number;
  ms: number;
  appeared: boolean;
};
export type TeamView = {
  score: number;
  fouls: number;
  /** Every turnover: its players' and the team's own. */
  turnovers: number;
  /** Turnovers charged to the team rather than a player. */
  teamTurnovers: number;
  /** Team fouls counted toward the bonus in the current period. */
  periodFouls: number;
  onCourt: string[];
  /** This team's own foul trouble. */
  penalty: 0 | 1 | 2;
  /** What this team shoots, driven by the opponent's fouls. */
  bonus: 0 | 1 | 2;
  /** Every timeout still standing, oldest first. */
  timeouts: { period: number; seconds: 60 | 30 }[];
  /**
   * Timeouts the team has left now, by length: what is allowed so far, by the
   * format, less what has been taken. Below zero when the team has taken more
   * than allowed (officials grant one, at the cost of a technical foul).
   */
  timeoutsLeft: { full: number; short: number };
};
export type Derived = {
  period: number;
  /** The clock mode now: the format's, or the latest switch still standing. */
  clockMode: ClockMode;
  periodStartElapsedMs: number;
  teams: Record<Side, TeamView>;
  players: Record<string, Line>;
  /** Player id → the period of each foul still standing, oldest first. */
  standing: Record<string, number[]>;
};

export class TrackerError extends Error {}
function fail(message: string): never {
  throw new TrackerError(message);
}

export const periodMs = (rules: Rules, period: number) =>
  1000 * (period <= rules.periods ? rules.periodSeconds : rules.overtimeSeconds);

/** Q1–Q4 or H1–H2, then OT1, OT2 and onwards. */
export function periodLabel(period: number, periods = 4): string {
  if (!Number.isInteger(period) || period < 1) return '';
  if (period > periods) return `OT${period - periods}`;
  return periods === 2 ? `H${period}` : `Q${period}`;
}

/** Regulation plus three overtimes, and the current period if a game ran past them. */
export function periodOptions(rules: Rules, current = 1) {
  const last = Math.max(rules.periods + 3, current);
  return Array.from({ length: last }, (_, i) => ({
    value: i + 1,
    label: periodLabel(i + 1, rules.periods),
  }));
}

export function newGame(rules: Rules = DEFAULT_RULES, now = 0): GameState {
  return {
    version: 1,
    status: 'scheduled',
    rules: { ...rules },
    clock: { remainingMs: periodMs(rules, 1), running: false, anchorAt: now, elapsedMs: 0 },
    plays: [],
    redo: [],
    colorsSwapped: false,
    recent: [],
    lastAt: now,
  };
}

/** The clock as it reads at `now`. A clock that reached zero has stopped there. */
export function clockAt(state: GameState, now: number): Clock {
  const c = state.clock;
  if (!c.running) return { ...c };
  const ran = Math.min(c.remainingMs, Math.max(0, now - c.anchorAt));
  const remainingMs = c.remainingMs - ran;
  return {
    remainingMs,
    running: remainingMs > 0,
    anchorAt: Math.max(c.anchorAt, now),
    elapsedMs: c.elapsedMs + ran,
  };
}

const bonusLevel = (fouls: number, rules: Rules): 0 | 1 | 2 =>
  rules.doubleBonusFouls != null && fouls >= rules.doubleBonusFouls
    ? 2
    : fouls >= rules.bonusFouls
      ? 1
      : 0;

export const bonusLabel = (level: number) =>
  level === 2 ? 'Double bonus' : level === 1 ? 'Bonus' : '';

/**
 * Everything shown, from the plays. `elapsedNowMs` is the clock's cumulative
 * running time now, so a player still on the floor is credited their open stint.
 */
export function derive(state: GameState, elapsedNowMs = state.clock.elapsedMs): Derived {
  const players: Record<string, Line> = {};
  const teams: Record<Side, TeamView> = { home: emptyTeam(), away: emptyTeam() };
  const since: Record<string, number> = {};
  const standing: Record<string, number[]> = {};
  let period = 1;
  let periodStartElapsedMs = 0;
  let clockMode = clockModeOf(state.rules);
  const line = (id: string, side: Side) => (players[id] ??= emptyLine(side));
  const bank = (id: string, side: Side, at: number) => {
    const from = since[id];
    if (from === undefined) return;
    line(id, side).ms += Math.max(0, at - from);
    delete since[id];
  };

  for (const play of state.plays) {
    switch (play.type) {
      case 'lineup': {
        const team = teams[play.side];
        for (const id of team.onCourt) bank(id, play.side, play.elapsedMs);
        team.onCourt = [...play.playerIds];
        for (const id of team.onCourt) {
          since[id] = play.elapsedMs;
          line(id, play.side).appeared = true;
        }
        break;
      }
      case 'score': {
        const l = line(play.playerId, play.side);
        l.points += play.points;
        if (play.points === 1) l.fg1 += 1;
        else if (play.points === 2) l.fg2 += 1;
        else l.fg3 += 1;
        l.appeared = true;
        teams[play.side].score += play.points;
        if (play.mercyClock) clockMode = 'running';
        break;
      }
      case 'foul': {
        const l = line(play.playerId, play.side);
        l.fouls += 1;
        l.appeared = true;
        teams[play.side].fouls += 1;
        (standing[play.playerId] ??= []).push(play.period);
        break;
      }
      case 'unfoul': {
        const list = standing[play.playerId];
        if (!list?.length) break;
        list.pop();
        line(play.playerId, play.side).fouls -= 1;
        teams[play.side].fouls -= 1;
        break;
      }
      case 'turnover': {
        const l = line(play.playerId, play.side);
        l.turnovers += 1;
        l.appeared = true;
        teams[play.side].turnovers += 1;
        break;
      }
      case 'unturnover': {
        const l = players[play.playerId];
        if (!l?.turnovers) break;
        l.turnovers -= 1;
        teams[l.side].turnovers -= 1;
        break;
      }
      case 'team-turnover':
        teams[play.side].teamTurnovers += 1;
        teams[play.side].turnovers += 1;
        break;
      case 'team-unturnover':
        if (!teams[play.side].teamTurnovers) break;
        teams[play.side].teamTurnovers -= 1;
        teams[play.side].turnovers -= 1;
        break;
      case 'timeout':
        teams[play.side].timeouts.push({ period: play.period, seconds: play.seconds });
        break;
      case 'untimeout':
        teams[play.side].timeouts.pop();
        break;
      case 'sub': {
        const team = teams[play.side];
        if (!team.onCourt.includes(play.outId) || team.onCourt.includes(play.inId)) break;
        team.onCourt = team.onCourt.map((id) => (id === play.outId ? play.inId : id));
        line(play.outId, play.side);
        bank(play.outId, play.side, play.elapsedMs);
        since[play.inId] = play.elapsedMs;
        line(play.inId, play.side).appeared = true;
        break;
      }
      case 'period':
        period = play.period;
        periodStartElapsedMs = play.elapsedMs;
        break;
      case 'clock-mode':
        clockMode = play.mode;
        break;
    }
  }

  for (const side of SIDES)
    for (const id of teams[side].onCourt) {
      const from = since[id];
      if (from !== undefined) line(id, side).ms += Math.max(0, elapsedNowMs - from);
    }

  // Team fouls reset each period; overtime continues the last regulation period's count.
  const bucket = (p: number) => Math.min(p, state.rules.periods);
  for (const [id, periods] of Object.entries(standing)) {
    const l = players[id];
    if (l) teams[l.side].periodFouls += periods.filter((p) => bucket(p) === bucket(period)).length;
  }
  for (const side of SIDES) {
    teams[side].penalty = bonusLevel(teams[side].periodFouls, state.rules);
    teams[side].bonus = bonusLevel(teams[otherSide(side)].periodFouls, state.rules);
    teams[side].timeoutsLeft = timeoutsLeft(state.rules, teams[side].timeouts, period);
  }
  return { period, periodStartElapsedMs, clockMode, teams, players, standing };
}

/**
 * Timeouts are allowed per window: the whole of regulation, or each half, then
 * each overtime period on its own. Q1–Q2 are the first half of a quarters game.
 */
function timeoutWindow(rules: Rules, period: number): number {
  const half = timeoutRules(rules).timeoutsPer === 'half';
  if (period > rules.periods) return (half ? 1 : 0) + (period - rules.periods);
  return half && period > rules.periods / 2 ? 1 : 0;
}

/** Timeouts left in `period`, by length; see `TeamView.timeoutsLeft`. */
export function timeoutsLeft(
  rules: Rules,
  taken: readonly { period: number; seconds: 60 | 30 }[],
  period: number,
): { full: number; short: number } {
  const t = timeoutRules(rules);
  const now = timeoutWindow(rules, period);
  const regulation = timeoutWindow(rules, rules.periods);
  // Without carry-over only this window's allowance counts; with it, every one so far.
  const first = t.timeoutsCarry ? 0 : now;
  const left = { full: 0, short: 0 };
  for (let w = first; w <= now; w++) {
    left.full += w <= regulation ? t.fullTimeouts : t.overtimeTimeouts;
    left.short += w <= regulation ? t.shortTimeouts : 0;
  }
  for (const timeout of taken) {
    const w = timeoutWindow(rules, timeout.period);
    if (w < first || w > now) continue;
    if (timeout.seconds === 30) left.short -= 1;
    else left.full -= 1;
  }
  return left;
}

const emptyLine = (side: Side): Line => ({
  side,
  points: 0,
  fg1: 0,
  fg2: 0,
  fg3: 0,
  fouls: 0,
  turnovers: 0,
  ms: 0,
  appeared: false,
});
const emptyTeam = (): TeamView => ({
  score: 0,
  fouls: 0,
  turnovers: 0,
  teamTurnovers: 0,
  periodFouls: 0,
  onCourt: [],
  penalty: 0,
  bonus: 0,
  timeouts: [],
  timeoutsLeft: { full: 0, short: 0 },
});

export type Context = { id: string; now: number };

/**
 * Apply one command. Returns a new state and leaves the input untouched; throws
 * TrackerError with a message fit to show the scorer when the command cannot apply.
 */
export function apply(state: GameState, command: Command, { id, now }: Context): GameState {
  const at = Math.max(now, state.lastAt);
  const s: GameState = {
    ...state,
    clock: clockAt(state, at),
    plays: [...state.plays],
    redo: [...state.redo],
    recent: [...state.recent],
    lastAt: at,
  };
  const type = (command as { type?: unknown })?.type;
  if (s.status === 'final' && type !== 'reopen' && type !== 'colors' && type !== 'reset')
    fail('This game is final. Reopen it to make changes.');

  switch (command.type) {
    case 'lineup':
    case 'score':
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
    case 'team-turnover':
    case 'team-unturnover':
    case 'timeout':
    case 'untimeout':
    case 'sub':
    case 'period':
    case 'clock-mode':
      record(s, command, id, at);
      break;
    case 'start':
      if (s.clock.running) fail('The clock is already running.');
      if (s.clock.remainingMs <= 0) fail('This period is over. Pick the next period first.');
      s.clock = { ...s.clock, running: true, anchorAt: at };
      if (s.status === 'scheduled') s.status = 'live';
      break;
    case 'pause':
      if (!s.clock.running) fail('The clock is not running.');
      s.clock = { ...s.clock, running: false };
      break;
    case 'set-clock':
      setClock(s, command.ms);
      break;
    case 'undo': {
      const play = s.plays.pop();
      if (!play) fail('Nothing to undo.');
      s.redo.push(play);
      if (play.type === 'period')
        s.clock = { ...s.clock, running: false, remainingMs: play.prevClockMs ?? 0 };
      break;
    }
    case 'redo': {
      const play = s.redo.pop();
      if (!play) fail('Nothing to redo.');
      s.plays.push(play);
      if (play.type === 'period')
        s.clock = { ...s.clock, running: false, remainingMs: periodMs(s.rules, play.period) };
      break;
    }
    case 'rules':
      if (s.plays.length || s.redo.length || s.clock.elapsedMs > 0)
        fail('The format is fixed once the game is under way. Mark it not started to change it.');
      s.rules = checkRules(command.rules);
      s.clock = { ...s.clock, running: false, remainingMs: periodMs(s.rules, 1) };
      break;
    case 'colors':
      s.colorsSwapped = command.swapped === true;
      break;
    case 'end':
      if (!hasRecordedStats(s)) fail('Nothing is recorded for this game yet.');
      s.clock = { ...s.clock, running: false };
      s.status = 'final';
      break;
    case 'reopen':
      if (s.status !== 'final') fail('Only a final game can be reopened.');
      s.status = 'live';
      break;
    case 'reset': {
      const fresh = newGame(s.rules, at);
      Object.assign(s, { ...fresh, colorsSwapped: s.colorsSwapped, recent: s.recent });
      break;
    }
    default:
      fail('Unknown action.');
  }
  s.recent.push(id);
  if (s.recent.length > RECENT_LIMIT) s.recent.splice(0, s.recent.length - RECENT_LIMIT);
  return s;
}

function record(s: GameState, input: Play, id: string, at: number) {
  const d = derive(s);
  const mode = clockModeAt(s, d);
  const play = checkPlay(input, d, s.rules, mode);
  const stamp = {
    id,
    at,
    period: d.period,
    clockMs: s.clock.remainingMs,
    elapsedMs: s.clock.elapsedMs,
  };
  if (play.type === 'period') {
    const prevClockMs = s.clock.remainingMs;
    s.clock = { ...s.clock, running: false, remainingMs: periodMs(s.rules, play.period) };
    s.plays.push({
      ...play,
      ...stamp,
      period: play.period,
      clockMs: s.clock.remainingMs,
      prevClockMs,
    });
  } else if (STOPS_CLOCK.has(play.type) && s.clock.running && mode === 'stop') {
    // The whistle stops the clock where the play happened; the scorer starts it again.
    s.clock = { ...s.clock, running: false };
    s.plays.push({ ...play, ...stamp, stoppedClock: true });
  } else if (play.type === 'score' && reachesMercy(s.rules, d, play)) {
    s.plays.push({ ...play, ...stamp, mercyClock: true });
  } else s.plays.push({ ...play, ...stamp });
  s.redo = [];
  // Setting lineups or the clock mode before tip-off does not make the game live for
  // viewers; anything else does.
  if (s.status === 'scheduled' && play.type !== 'lineup' && play.type !== 'clock-mode')
    s.status = 'live';
}

/**
 * Does this basket switch the game to a running clock under the mercy rule? Only when
 * the clock stops on fouls and the lead goes from below the mercy lead to it or past it.
 * A lead already there does not switch again, so a scorer who switched back keeps a
 * stop clock until the lead drops below and reaches it once more.
 */
function reachesMercy(rules: Rules, d: Derived, play: Extract<Play, { type: 'score' }>): boolean {
  const lead = rules.mercyLead;
  if (lead == null || d.clockMode !== 'stop') return false;
  const own = d.teams[play.side].score;
  const other = d.teams[otherSide(play.side)].score;
  return Math.abs(own - other) < lead && Math.abs(own + play.points - other) >= lead;
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 100;
const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';

/**
 * A clean copy of a play, holding only the fields it should, or a TrackerError.
 * `mode` is the clock mode in force (`clockModeAt`), which a switch must change.
 */
function checkPlay(input: Play, d: Derived, rules: Rules, mode: ClockMode): Play {
  if (input.type === 'period') {
    const period = input.period;
    if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) fail('Pick a period.');
    if (period === d.period) fail(`It is already ${periodLabel(period, rules.periods)}.`);
    return { type: 'period', period };
  }
  if (input.type === 'clock-mode') {
    const next = input.mode;
    if (next !== 'stop' && next !== 'running') fail('Pick a stop clock or a running clock.');
    if (next === mode)
      fail(
        next === 'running'
          ? 'The clock is already running through fouls.'
          : 'The clock already stops on fouls.',
      );
    return { type: 'clock-mode', mode: next };
  }
  if (!isSide(input.side)) fail('Unknown team.');
  const side = input.side;
  switch (input.type) {
    case 'lineup': {
      const ids: unknown[] = Array.isArray(input.playerIds) ? input.playerIds : [];
      if (!ids.length || ids.length > LINEUP_SIZE || !ids.every(isId))
        fail(`Pick 1–${LINEUP_SIZE} players.`);
      if (new Set(ids).size !== ids.length) fail('Pick each player once.');
      if (d.teams[side].onCourt.length)
        fail('This team already has players on the floor. Use substitutions.');
      return { type: 'lineup', side, playerIds: ids as string[] };
    }
    case 'score': {
      const points = input.points;
      if (points !== 1 && points !== 2 && points !== 3) fail('A basket is 1, 2 or 3 points.');
      if (!isId(input.playerId)) fail('Pick a player.');
      return { type: 'score', side, playerId: input.playerId, points };
    }
    case 'foul':
      if (!isId(input.playerId)) fail('Pick a player.');
      return { type: 'foul', side, playerId: input.playerId };
    case 'unfoul':
      if (!isId(input.playerId)) fail('Pick a player.');
      if (!d.standing[input.playerId]?.length) fail('That player has no foul to take back.');
      return { type: 'unfoul', side, playerId: input.playerId };
    case 'turnover':
      if (!isId(input.playerId)) fail('Pick a player.');
      return { type: 'turnover', side, playerId: input.playerId };
    case 'unturnover':
      if (!isId(input.playerId)) fail('Pick a player.');
      if (!d.players[input.playerId]?.turnovers) fail('That player has no turnover to take back.');
      return { type: 'unturnover', side, playerId: input.playerId };
    case 'team-turnover':
      return { type: 'team-turnover', side };
    case 'team-unturnover':
      if (!d.teams[side].teamTurnovers) fail('There is no team turnover to take back.');
      return { type: 'team-unturnover', side };
    case 'timeout':
      // More than the format allows is still recorded: officials grant it, with a technical foul.
      if (input.seconds !== 60 && input.seconds !== 30) fail('A timeout is 60 or 30 seconds.');
      return { type: 'timeout', side, seconds: input.seconds };
    case 'untimeout':
      if (!d.teams[side].timeouts.length) fail('There is no timeout to take back.');
      return { type: 'untimeout', side };
    case 'sub': {
      const { inId, outId } = input;
      if (!isId(inId) || !isId(outId) || inId === outId)
        fail('Pick who comes on and who comes off.');
      const court = d.teams[side].onCourt;
      if (!court.includes(outId)) fail('The player coming off is not on the floor.');
      if (court.includes(inId)) fail('That player is already on the floor.');
      return { type: 'sub', side, inId, outId };
    }
  }
}

function checkRules(rules: Rules): Rules {
  const r = rules ?? ({} as Rules);
  const whole = (v: unknown, min: number, max: number) =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (r.periods !== 2 && r.periods !== 4) fail('Play halves or quarters.');
  if (!whole(r.periodSeconds, 60, 3600)) fail('A period runs 1 to 60 minutes.');
  if (!whole(r.overtimeSeconds, 60, 1800)) fail('Overtime runs 1 to 30 minutes.');
  if (!whole(r.bonusFouls, 1, 30)) fail('The bonus starts between 1 and 30 team fouls.');
  if (r.doubleBonusFouls != null && !whole(r.doubleBonusFouls, r.bonusFouls + 1, 40))
    fail('The double bonus must come after the bonus.');
  // A format sent without timeouts (a page from before they were tracked) gets TCSAAL's.
  const t = timeoutRules(r);
  if (!whole(t.fullTimeouts, 0, 10) || !whole(t.shortTimeouts, 0, 10))
    fail('Allow 0 to 10 timeouts of each length.');
  if (t.timeoutsPer !== 'game' && t.timeoutsPer !== 'half')
    fail('Timeouts are per game or per half.');
  if (!whole(t.overtimeTimeouts, 0, 5)) fail('Allow 0 to 5 timeouts each overtime.');
  if (typeof t.timeoutsCarry !== 'boolean') fail('Say whether unused timeouts carry over.');
  if (r.clockMode !== undefined && r.clockMode !== 'stop' && r.clockMode !== 'running')
    fail('Pick a stop clock or a running clock.');
  const given = <T>(v: T | null | undefined): v is T => v !== undefined && v !== null;
  if (
    given(r.stopClockLastSeconds) &&
    !whole(r.stopClockLastSeconds, 1, Math.min(600, r.periodSeconds))
  )
    fail('The last-minutes stop clock runs 1 second to 10 minutes, and no longer than a period.');
  if (r.stopClockScope !== undefined && !STOP_CLOCK_SCOPES.includes(r.stopClockScope))
    fail('The last-minutes stop clock is at the end of each period, each half or the game.');
  if (given(r.mercyLead) && !whole(r.mercyLead, 1, 100))
    fail('The mercy rule starts at a lead of 1 to 100 points.');
  return {
    periods: r.periods,
    periodSeconds: r.periodSeconds,
    overtimeSeconds: r.overtimeSeconds,
    bonusFouls: r.bonusFouls,
    doubleBonusFouls: r.doubleBonusFouls ?? null,
    ...t,
    // Kept only when given, so a format from before the mode existed stays as it was.
    ...(r.clockMode !== undefined ? { clockMode: r.clockMode } : {}),
    // The same for each rule below; null, which also means off, is dropped.
    ...(given(r.stopClockLastSeconds) ? { stopClockLastSeconds: r.stopClockLastSeconds } : {}),
    ...(r.stopClockScope !== undefined ? { stopClockScope: r.stopClockScope } : {}),
    ...(given(r.mercyLead) ? { mercyLead: r.mercyLead } : {}),
  };
}

/**
 * Set the clock, stopping it.
 *
 * Time put back on the clock within a period is time it should never have run,
 * nearly always a clock left going through a stoppage, so whoever was on the
 * floor gives those seconds back: cumulative running time winds back (never
 * past the start of the period) and plays stamped after that moment move onto
 * it. What was recorded still counts; only when it happened moves. Setting the
 * clock forward is the scorer catching up and leaves minutes alone.
 */
function setClock(s: GameState, ms: number) {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_CLOCK_MS)
    fail('Set the clock between 0:00 and 60:00.');
  const clock = { ...s.clock, running: false };
  if (ms > clock.remainingMs) {
    const d = derive(s);
    const floor = Math.min(clock.elapsedMs, d.periodStartElapsedMs);
    const back = Math.min(ms - clock.remainingMs, clock.elapsedMs - floor);
    if (back > 0) {
      const to = clock.elapsedMs - back;
      const restamp = (p: LoggedPlay): LoggedPlay =>
        p.elapsedMs > to
          ? { ...p, elapsedMs: to, ...(p.period === d.period ? { clockMs: ms } : {}) }
          : p;
      s.plays = s.plays.map(restamp);
      s.redo = s.redo.map(restamp);
      clock.elapsedMs = to;
    }
  }
  clock.remainingMs = ms;
  s.clock = clock;
}

/** Has a basket, foul or turnover been recorded? Lineups and substitutions alone are not a played game. */
export const hasRecordedStats = (state: GameState) =>
  state.plays.some(
    (p) =>
      p.type === 'score' ||
      p.type === 'foul' ||
      p.type === 'turnover' ||
      p.type === 'team-turnover',
  );

/** The score after each play, for a play-by-play log. */
export function runningScores(plays: readonly Play[]) {
  const score = { home: 0, away: 0 };
  return plays.map((play) => {
    if (play.type === 'score') score[play.side] += play.points;
    return { home: score.home, away: score.away };
  });
}

/** Short description of a play, for the undo button and the play log. */
export function describePlay(
  play: Play,
  nameOf: (id: string) => string,
  teamOf: (side: Side) => string = () => 'Team',
  periods = 4,
): string {
  switch (play.type) {
    case 'score':
      return `${nameOf(play.playerId)} +${play.points}`;
    case 'foul':
      return `Foul — ${nameOf(play.playerId)}`;
    case 'unfoul':
      return `Foul taken back — ${nameOf(play.playerId)}`;
    case 'turnover':
      return `Turnover — ${nameOf(play.playerId)}`;
    case 'unturnover':
      return `Turnover taken back — ${nameOf(play.playerId)}`;
    case 'team-turnover':
      return `Team turnover — ${teamOf(play.side)}`;
    case 'team-unturnover':
      return `Team turnover taken back — ${teamOf(play.side)}`;
    case 'timeout':
      return `${play.seconds === 30 ? '30-second' : 'Full'} timeout — ${teamOf(play.side)}`;
    case 'untimeout':
      return `Timeout taken back — ${teamOf(play.side)}`;
    case 'sub':
      return `Sub: ${nameOf(play.inId)} in for ${nameOf(play.outId)}`;
    case 'lineup':
      return `${teamOf(play.side)} starting lineup: ${play.playerIds.map(nameOf).join(', ')}`;
    case 'period':
      return `Start of ${periodLabel(play.period, periods)}`;
    case 'clock-mode':
      return play.mode === 'running' ? 'Running clock on' : 'Stop clock on';
  }
}

/** Game clock `m:ss`, rounded up so the last half-second still reads 0:01. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Minutes played `m:ss`, rounded down. */
export function formatMinutes(ms: number): string {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
