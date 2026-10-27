import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  clockAt,
  derive,
  describePlay,
  formatClock,
  formatMinutes,
  newGame,
  periodLabel,
  runningScores,
  HALVES,
  QUARTERS,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';

const H = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const A = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
let n = 0;
/** Apply commands in order, each `step` ms after the last. */
function run(state, commands, { start = 1_000, step = 0 } = {}) {
  let t = start;
  for (const c of commands) {
    state = apply(state, c, { id: `c${++n}`, now: t });
    t += step;
  }
  return state;
}
const at = (state, command, now) => apply(state, command, { id: `c${++n}`, now });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: H.slice(0, 5) },
  { type: 'lineup', side: 'away', playerIds: A.slice(0, 5) },
];

test('baskets and fouls total by player and team; the score is the sum of points', () => {
  const s = run(newGame(QUARTERS), [
    ...lineups,
    { type: 'score', side: 'home', playerId: 'h1', points: 3 },
    { type: 'score', side: 'home', playerId: 'h1', points: 2 },
    { type: 'score', side: 'home', playerId: 'h2', points: 1 },
    { type: 'score', side: 'away', playerId: 'a1', points: 2 },
    { type: 'foul', side: 'away', playerId: 'a2' },
  ]);
  const d = derive(s);
  assert.equal(s.status, 'live');
  assert.deepEqual([d.teams.home.score, d.teams.away.score], [6, 2]);
  assert.deepEqual(
    { ...d.players.h1, ms: 0 },
    { side: 'home', points: 5, fg1: 0, fg2: 1, fg3: 1, fouls: 0, ms: 0, appeared: true },
  );
  assert.equal(d.players.h2.fg1, 1);
  assert.equal(d.players.a2.fouls, 1);
  assert.equal(d.teams.away.fouls, 1);
  assert.equal(d.teams.away.periodFouls, 1);
});

test('lineups alone do not make a game live; bench players can still score', () => {
  let s = run(newGame(), lineups);
  assert.equal(s.status, 'scheduled');
  s = run(s, [{ type: 'score', side: 'home', playerId: 'h6', points: 2 }]);
  assert.equal(s.status, 'live');
  assert.equal(derive(s).players.h6.appeared, true);
});

test('undo and redo walk the play list exactly; a new play drops the redo tail', () => {
  let s = run(newGame(), [
    ...lineups,
    { type: 'score', side: 'home', playerId: 'h1', points: 2 },
    { type: 'score', side: 'home', playerId: 'h1', points: 3 },
  ]);
  s = run(s, [{ type: 'undo' }]);
  assert.equal(derive(s).teams.home.score, 2);
  s = run(s, [{ type: 'redo' }]);
  assert.equal(derive(s).teams.home.score, 5);
  s = run(s, [{ type: 'undo' }, { type: 'undo' }]);
  assert.equal(derive(s).teams.home.score, 0);
  assert.equal(derive(s).players.h1?.points ?? 0, 0);
  s = run(s, [{ type: 'foul', side: 'home', playerId: 'h3' }]);
  assert.equal(s.redo.length, 0);
  assert.throws(() => run(s, [{ type: 'redo' }]), TrackerError);
});

test('−Foul takes back the latest standing foul and only counts against its own period', () => {
  let s = run(newGame(QUARTERS), [
    ...lineups,
    { type: 'foul', side: 'home', playerId: 'h1' },
    { type: 'period', period: 2 },
    { type: 'foul', side: 'home', playerId: 'h2' },
  ]);
  assert.equal(derive(s).teams.home.periodFouls, 1);
  s = run(s, [{ type: 'unfoul', side: 'home', playerId: 'h1' }]);
  const d = derive(s);
  assert.equal(d.players.h1.fouls, 0);
  assert.equal(d.teams.home.fouls, 1);
  assert.equal(d.teams.home.periodFouls, 1, 'a Q1 foul taken back leaves the Q2 count alone');
  assert.throws(
    () => run(s, [{ type: 'unfoul', side: 'home', playerId: 'h1' }]),
    /no foul to take back/,
  );
});

test('bonus comes from the opponent’s team fouls; quarters reset and overtime carries on', () => {
  let s = run(newGame(QUARTERS), lineups);
  for (let i = 0; i < 5; i++) s = run(s, [{ type: 'foul', side: 'away', playerId: 'a1' }]);
  let d = derive(s);
  assert.equal(d.teams.away.penalty, 1);
  assert.equal(d.teams.home.bonus, 1);
  assert.equal(d.teams.away.bonus, 0);
  s = run(s, [{ type: 'period', period: 4 }]);
  assert.equal(derive(s).teams.home.bonus, 0, 'new quarter, new count');
  for (let i = 0; i < 5; i++) s = run(s, [{ type: 'foul', side: 'away', playerId: 'a2' }]);
  s = run(s, [{ type: 'period', period: 5 }]);
  d = derive(s);
  assert.equal(periodLabel(d.period, 4), 'OT1');
  assert.equal(d.teams.home.bonus, 1, 'overtime continues the fourth quarter');

  let h = run(newGame(HALVES), lineups);
  for (let i = 0; i < 10; i++) h = run(h, [{ type: 'foul', side: 'home', playerId: 'h1' }]);
  assert.equal(derive(h).teams.away.bonus, 2);
});

test('the clock runs from its anchor, stops at zero and never runs backwards', () => {
  let s = at(newGame(QUARTERS), { type: 'start' }, 10_000);
  assert.equal(clockAt(s, 70_000).remainingMs, 480_000 - 60_000);
  assert.equal(clockAt(s, 10_000 + 600_000).remainingMs, 0);
  assert.equal(clockAt(s, 10_000 + 600_000).running, false);
  s = at(s, { type: 'pause' }, 40_000);
  assert.equal(s.clock.remainingMs, 450_000);
  assert.equal(s.clock.elapsedMs, 30_000);
  // A command stamped before the last one is applied at the last one's time.
  s = at(s, { type: 'start' }, 30_000);
  assert.equal(s.clock.anchorAt, 40_000);
  assert.throws(() => at(s, { type: 'start' }, 41_000), /already running/);
});

test('minutes credit each stint of running clock, including the one in progress', () => {
  let s = run(newGame(QUARTERS), lineups, { start: 0 });
  s = at(s, { type: 'start' }, 0);
  s = at(s, { type: 'sub', side: 'home', inId: 'h6', outId: 'h1' }, 60_000);
  s = at(s, { type: 'pause' }, 90_000);
  s = at(s, { type: 'start' }, 500_000); // stoppage: no minutes
  const d = derive(s, clockAt(s, 520_000).elapsedMs);
  assert.equal(d.players.h1.ms, 60_000);
  assert.equal(d.players.h6.ms, 30_000 + 20_000);
  assert.equal(d.players.h2.ms, 110_000);
  assert.equal(d.players.a6, undefined, 'never on the floor, no line');
  const total = Object.values(d.players)
    .filter((p) => p.side === 'home')
    .reduce((sum, p) => sum + p.ms, 0);
  assert.equal(total, 5 * 110_000, 'five players on the floor for the whole running time');
});

test('setting the clock back takes those seconds off whoever was on the floor', () => {
  let s = run(newGame(QUARTERS), lineups, { start: 0 });
  s = at(s, { type: 'start' }, 0);
  s = at(s, { type: 'score', side: 'home', playerId: 'h1', points: 2 }, 50_000);
  s = at(s, { type: 'sub', side: 'home', inId: 'h6', outId: 'h1' }, 55_000);
  // Clock should have been stopped at 40s for a free throw: put 20s back.
  s = at(s, { type: 'set-clock', ms: 480_000 - 40_000 }, 60_000);
  assert.equal(s.clock.running, false);
  assert.equal(s.clock.elapsedMs, 40_000);
  const d = derive(s);
  assert.equal(d.players.h1.ms, 40_000);
  assert.equal(d.players.h6.ms, 0);
  assert.equal(d.players.h1.points, 2, 'what was recorded still counts');
  assert.ok(s.plays.slice(-2).every((p) => p.elapsedMs === 40_000 && p.clockMs === 440_000));
  // Forward is the scorer catching up: minutes alone.
  s = at(s, { type: 'set-clock', ms: 300_000 }, 61_000);
  assert.equal(s.clock.elapsedMs, 40_000);
  // Never back past the start of the period.
  s = at(s, { type: 'set-clock', ms: 3_000_000 }, 62_000);
  assert.equal(s.clock.elapsedMs, 0);
});

test('a period change resets the clock; undoing it puts the old clock back', () => {
  let s = at(newGame(QUARTERS), { type: 'start' }, 0);
  s = at(s, { type: 'period', period: 2 }, 100_000);
  assert.equal(s.clock.remainingMs, 480_000);
  assert.equal(s.clock.running, false);
  assert.equal(derive(s).period, 2);
  s = at(s, { type: 'undo' }, 101_000);
  assert.equal(derive(s).period, 1);
  assert.equal(s.clock.remainingMs, 380_000);
  s = at(s, { type: 'redo' }, 102_000);
  assert.equal(derive(s).period, 2);
  assert.equal(s.clock.remainingMs, 480_000);
  assert.throws(() => at(s, { type: 'period', period: 2 }, 103_000), /already Q2/);
});

test('substitutions and lineups are checked', () => {
  const s = run(newGame(), lineups);
  assert.throws(
    () => run(s, [{ type: 'sub', side: 'home', inId: 'h6', outId: 'h6' }]),
    TrackerError,
  );
  assert.throws(
    () => run(s, [{ type: 'sub', side: 'home', inId: 'h2', outId: 'h1' }]),
    /already on the floor/,
  );
  assert.throws(
    () => run(s, [{ type: 'sub', side: 'home', inId: 'h6', outId: 'x' }]),
    /not on the floor/,
  );
  assert.throws(() => run(s, [lineups[0]]), /Use substitutions/);
  assert.throws(
    () => run(newGame(), [{ type: 'lineup', side: 'home', playerIds: H }]),
    /Pick 1–5 players/,
  );
  // A short-handed team can start with fewer than five.
  const short = run(newGame(), [{ type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3'] }]);
  assert.equal(derive(short).teams.home.onCourt.length, 3);
});

test('final games are locked until reopened; reset clears plays but keeps the format', () => {
  let s = run(newGame(HALVES), [
    ...lineups,
    { type: 'score', side: 'away', playerId: 'a1', points: 2 },
  ]);
  assert.throws(() => run(newGame(), [{ type: 'end' }]), /Nothing is recorded/);
  s = run(s, [{ type: 'end' }]);
  assert.equal(s.status, 'final');
  assert.throws(() => run(s, [{ type: 'foul', side: 'away', playerId: 'a1' }]), /final/);
  s = run(s, [{ type: 'colors', swapped: true }, { type: 'reopen' }]);
  assert.equal(s.status, 'live');
  s = run(s, [{ type: 'reset' }]);
  assert.equal(s.status, 'scheduled');
  assert.equal(s.plays.length, 0);
  assert.equal(s.rules.periods, 2);
  assert.equal(s.colorsSwapped, true);
});

test('the format can change only before the game is under way', () => {
  let s = run(newGame(QUARTERS), [{ type: 'rules', rules: HALVES }]);
  assert.equal(s.clock.remainingMs, 20 * 60_000);
  assert.throws(
    () => run(s, [{ type: 'rules', rules: { ...HALVES, doubleBonusFouls: 3 } }]),
    /double bonus/,
  );
  s = run(s, lineups);
  assert.throws(() => run(s, [{ type: 'rules', rules: QUARTERS }]), /fixed once/);
});

test('apply never mutates its input and remembers recent command ids', () => {
  const before = run(newGame(), lineups);
  const copy = structuredClone(before);
  const after = apply(
    before,
    { type: 'score', side: 'home', playerId: 'h1', points: 2 },
    { id: 'k', now: 5 },
  );
  assert.deepEqual(before, copy);
  assert.equal(after.recent.at(-1), 'k');
  assert.throws(() => apply(before, { type: 'warp' }, { id: 'x', now: 6 }), /Unknown action/);
});

test('descriptions, running scores and clock formatting', () => {
  const s = run(newGame(), [
    ...lineups,
    { type: 'score', side: 'away', playerId: 'a1', points: 3 },
  ]);
  const nameOf = (id) => `#${id}`;
  assert.equal(describePlay(s.plays[2], nameOf), '#a1 +3');
  assert.match(
    describePlay(s.plays[0], nameOf, () => 'Al-Hadi'),
    /^Al-Hadi starting lineup: #h1/,
  );
  assert.deepEqual(runningScores(s.plays).at(-1), { home: 0, away: 3 });
  assert.equal(formatClock(480_000), '8:00');
  assert.equal(formatClock(500), '0:01');
  assert.equal(formatMinutes(59_999), '0:59');
  assert.equal(periodLabel(2, 2), 'H2');
  assert.equal(periodLabel(6, 4), 'OT2');
});
