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
 * on each play.
 */

export type Side = 'home' | 'away';
export const SIDES: readonly Side[] = ['home', 'away'];
export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home');

export type Rules = {
  /** Regulation periods: 2 halves or 4 quarters. */
  periods: 2 | 4;
  periodSeconds: number;
  overtimeSeconds: number;
  /** Team fouls in a period that put the other team in the bonus. */
  bonusFouls: number;
  /** Team fouls for the double bonus, or null when the format has none. */
  doubleBonusFouls: number | null;
};

/** High-school format: 8-minute quarters, team fouls reset each quarter, bonus on the 5th. */
export const QUARTERS: Rules = {
  periods: 4,
  periodSeconds: 8 * 60,
  overtimeSeconds: 4 * 60,
  bonusFouls: 5,
  doubleBonusFouls: null,
};
/** Rec-league format, as Faraj League plays it: 20-minute halves, bonus on 7, double on 10. */
export const HALVES: Rules = {
  periods: 2,
  periodSeconds: 20 * 60,
  overtimeSeconds: 5 * 60,
  bonusFouls: 7,
  doubleBonusFouls: 10,
};
export const DEFAULT_RULES = QUARTERS;

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
  | { type: 'sub'; side: Side; inId: string; outId: string }
  | { type: 'period'; period: number };

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
  ms: number;
  appeared: boolean;
};
export type TeamView = {
  score: number;
  fouls: number;
  /** Team fouls counted toward the bonus in the current period. */
  periodFouls: number;
  onCourt: string[];
  /** This team's own foul trouble. */
  penalty: 0 | 1 | 2;
  /** What this team shoots, driven by the opponent's fouls. */
  bonus: 0 | 1 | 2;
};
export type Derived = {
  period: number;
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
  }
  return { period, periodStartElapsedMs, teams, players, standing };
}

const emptyLine = (side: Side): Line => ({
  side,
  points: 0,
  fg1: 0,
  fg2: 0,
  fg3: 0,
  fouls: 0,
  ms: 0,
  appeared: false,
});
const emptyTeam = (): TeamView => ({
  score: 0,
  fouls: 0,
  periodFouls: 0,
  onCourt: [],
  penalty: 0,
  bonus: 0,
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
    case 'sub':
    case 'period':
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
  const play = checkPlay(input, d, s.rules);
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
  } else s.plays.push({ ...play, ...stamp });
  s.redo = [];
  // Setting lineups before tip-off does not make the game live for viewers; anything else does.
  if (s.status === 'scheduled' && play.type !== 'lineup') s.status = 'live';
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 100;
const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';

/** A clean copy of a play, holding only the fields it should, or a TrackerError. */
function checkPlay(input: Play, d: Derived, rules: Rules): Play {
  if (input.type === 'period') {
    const period = input.period;
    if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) fail('Pick a period.');
    if (period === d.period) fail(`It is already ${periodLabel(period, rules.periods)}.`);
    return { type: 'period', period };
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
  return {
    periods: r.periods,
    periodSeconds: r.periodSeconds,
    overtimeSeconds: r.overtimeSeconds,
    bonusFouls: r.bonusFouls,
    doubleBonusFouls: r.doubleBonusFouls ?? null,
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

/** Has a basket or foul been recorded? Lineups and substitutions alone are not a played game. */
export const hasRecordedStats = (state: GameState) =>
  state.plays.some((p) => p.type === 'score' || p.type === 'foul');

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
    case 'sub':
      return `Sub: ${nameOf(play.inId)} in for ${nameOf(play.outId)}`;
    case 'lineup':
      return `${teamOf(play.side)} starting lineup: ${play.playerIds.map(nameOf).join(', ')}`;
    case 'period':
      return `Start of ${periodLabel(play.period, periods)}`;
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
