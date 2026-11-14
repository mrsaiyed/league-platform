// The last-minutes stop clock (P7 §1, S-21, T-128; step 2.67): under a running clock, a
// foul or a timeout in the last seconds of a half (or each period, or the game) stops the
// clock. Off when the format leaves it out. The scorer's own switch overrides it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  clockAt,
  clockModeAt,
  derive,
  inLastMinutes,
  newGame,
  HALVES,
  QUARTERS,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';
import * as server from '../packages/sports/src/basketball/live.ts';
import { deviceEngine, replay } from './support/device-engine.mjs';

let n = 0;
const at = (state, command, now) => apply(state, command, { id: `l${++n}`, now });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
];
const foul = { type: 'foul', side: 'home', playerId: 'h1' };
const timeout = { type: 'timeout', side: 'away', seconds: 60 };
const running = { type: 'clock-mode', mode: 'running' };
const stop = { type: 'clock-mode', mode: 'stop' };
/** Rec-league halves on a running clock, with a stop clock in the last two minutes of each half. */
const REC = { ...HALVES, clockMode: 'running', stopClockLastSeconds: 120 };

/** A game in `period` with the clock started at t=1000 and `ms` left on it. */
function late(rules, period, ms) {
  let s = newGame(rules, 0);
  for (const c of lineups) s = at(s, c, 500);
  if (period !== 1) s = at(s, { type: 'period', period }, 600);
  s = at(s, { type: 'set-clock', ms }, 700);
  return at(s, { type: 'start' }, 1_000);
}

test('without the rule nothing is in the last minutes, so a game reads as before', () => {
  assert.equal(inLastMinutes(HALVES, 2, 1_000), false);
  assert.equal(inLastMinutes({ ...HALVES, stopClockLastSeconds: null }, 2, 1_000), false);
  assert.equal('stopClockLastSeconds' in newGame(QUARTERS).rules, false);
  let s = late({ ...HALVES, clockMode: 'running' }, 2, 30_000);
  s = at(s, foul, 2_000);
  assert.equal(s.clock.running, true, 'a running clock still runs through a late foul');
  assert.equal(s.plays.at(-1).stoppedClock, undefined);
});

test('the scope says which periods end in a stop clock; overtime always does', () => {
  const q = (scope) => ({ ...QUARTERS, stopClockLastSeconds: 60, stopClockScope: scope });
  const where = (rules) =>
    [1, 2, 3, 4, 5, 6].filter((period) => inLastMinutes(rules, period, 60_000));
  assert.deepEqual(where(q('period')), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(where(q('half')), [2, 4, 5, 6]);
  assert.deepEqual(where(q(undefined)), [2, 4, 5, 6], 'absent means each half');
  assert.deepEqual(where(q('game')), [4, 5, 6]);
  assert.deepEqual(
    [1, 2, 3].filter((period) => inLastMinutes(REC, period, 120_000)),
    [1, 2, 3],
  );
  assert.equal(inLastMinutes(REC, 2, 120_001), false, 'only inside the last two minutes');
  assert.equal(inLastMinutes({ ...REC, stopClockScope: 'game' }, 1, 1_000), false);
});

test('in the last minutes a foul and a timeout stop a running clock; before them they do not', () => {
  let s = late(REC, 2, 125_000);
  s = at(s, foul, 3_000); // 2:03 left
  assert.equal(s.clock.running, true);
  assert.equal(clockModeAt(s), 'running');
  s = at(s, foul, 6_000); // 2:00 left
  assert.equal(s.clock.running, false);
  assert.equal(s.plays.at(-1).stoppedClock, true);
  assert.equal(s.plays.at(-1).clockMs, 120_000);
  // The format is still a running clock; only the last minutes stop it.
  assert.equal(derive(s).clockMode, 'running');
  assert.equal(clockModeAt(s), 'stop');
  s = at(s, { type: 'start' }, 7_000);
  s = at(s, timeout, 9_000);
  assert.equal(s.clock.running, false);
  assert.equal(s.plays.at(-1).stoppedClock, true);
  assert.equal(derive(s).teams.home.fouls, 2);
});

test('the first half ends in a stop clock too, and each overtime even when the scope is the game', () => {
  let s = late(REC, 1, 90_000);
  s = at(s, foul, 2_000);
  assert.equal(s.clock.running, false);
  let g = late({ ...REC, stopClockScope: 'game' }, 1, 90_000);
  g = at(g, foul, 2_000);
  assert.equal(
    g.clock.running,
    true,
    'not at the end of the first half when the scope is the game',
  );
  let ot = late({ ...REC, stopClockScope: 'game' }, 3, 90_000);
  ot = at(ot, foul, 2_000);
  assert.equal(ot.clock.running, false);
});

test('undo and redo of a late foul keep where the clock stopped', () => {
  let s = late(REC, 2, 60_000);
  s = at(s, foul, 2_000);
  assert.equal(s.clock.running, false);
  s = at(s, { type: 'undo' }, 3_000);
  assert.equal(derive(s).teams.home.fouls, 0);
  assert.equal(s.clock.running, false, 'undo does not restart the clock');
  assert.equal(s.clock.remainingMs, 59_000);
  s = at(s, { type: 'redo' }, 4_000);
  assert.equal(derive(s).teams.home.fouls, 1);
  assert.equal(s.plays.at(-1).stoppedClock, true);
});

test('the scorer can keep a running clock through the last minutes, and undo that', () => {
  let s = late(REC, 2, 100_000);
  // Outside the window the clock already runs through fouls, so the switch is refused there.
  const early = late(REC, 2, 500_000);
  assert.throws(() => at(early, running, 2_000), /already running through fouls/);
  s = at(s, running, 2_000);
  assert.equal(clockModeAt(s), 'running');
  s = at(s, foul, 3_000);
  assert.equal(s.clock.running, true, 'the scorer overrides the automatic stop clock');
  assert.throws(() => at(s, running, 4_000), /already running through fouls/);
  // Undoing the switch brings the stop clock back.
  s = at(s, { type: 'undo' }, 4_000);
  s = at(s, { type: 'undo' }, 5_000);
  assert.equal(clockModeAt(s), 'stop');
  s = at(s, foul, 6_000);
  assert.equal(s.clock.running, false);
  // And the scorer can switch back to the stop clock after overriding it.
  let t = late(REC, 2, 100_000);
  t = at(t, running, 2_000);
  t = at(t, stop, 3_000);
  t = at(t, foul, 4_000);
  assert.equal(t.clock.running, false);
});

test('an override lasts for that window only; the next half ends in a stop clock again', () => {
  const rules = { ...QUARTERS, clockMode: 'running', stopClockLastSeconds: 60 };
  let s = late(rules, 2, 30_000);
  s = at(s, running, 2_000);
  s = at(s, { type: 'period', period: 4 }, 3_000);
  s = at(s, { type: 'set-clock', ms: 30_000 }, 4_000);
  s = at(s, { type: 'start' }, 5_000);
  assert.equal(clockModeAt(s), 'stop');
  s = at(s, foul, 6_000);
  assert.equal(s.clock.running, false);
  // A switch to a running clock made before the window does not hold inside it either.
  let t = late({ ...REC, clockMode: 'stop' }, 2, 600_000);
  t = at(t, running, 2_000);
  t = at(t, { type: 'set-clock', ms: 60_000 }, 3_000);
  t = at(t, { type: 'start' }, 4_000);
  t = at(t, foul, 5_000);
  assert.equal(t.clock.running, false);
});

test('a switch inside the window keeps to that window, whatever the period selector or clock do', () => {
  const rules = { ...QUARTERS, clockMode: 'running', stopClockLastSeconds: 120 };
  // Q4 to Q3 and back to Q4 is a new window: the switch made in the first one is over.
  let s = late(rules, 4, 60_000);
  s = at(s, running, 2_000);
  assert.equal(s.plays.at(-1).lastMinutes, true);
  assert.equal(clockModeAt(s), 'running');
  s = at(s, { type: 'pause' }, 2_500);
  s = at(s, { type: 'period', period: 3 }, 3_000);
  s = at(s, { type: 'period', period: 4 }, 3_500);
  s = at(s, { type: 'set-clock', ms: 60_000 }, 4_000);
  s = at(s, { type: 'start' }, 5_000);
  assert.equal(clockModeAt(s), 'stop');
  s = at(s, foul, 6_000);
  assert.equal(s.clock.running, false);
  // Undoing a mistaken change of period brings the switch back with its window.
  let u = late(rules, 4, 60_000);
  u = at(u, running, 2_000);
  u = at(u, { type: 'pause' }, 2_500);
  u = at(u, { type: 'period', period: 3 }, 3_000);
  u = at(u, { type: 'undo' }, 3_500);
  assert.equal(clockModeAt(u), 'running');
  // Setting the clock back past the window restamps the switch but does not undo it.
  let t = late(rules, 4, 60_000);
  t = at(t, running, 2_000);
  t = at(t, { type: 'set-clock', ms: 300_000 }, 3_000);
  assert.equal(t.plays.at(-1).clockMs, 300_000, 'the switch moved out of the window');
  assert.equal(clockModeAt(t), 'running');
  t = at(t, { type: 'set-clock', ms: 30_000 }, 4_000);
  t = at(t, { type: 'start' }, 5_000);
  assert.equal(clockModeAt(t), 'running');
  t = at(t, foul, 6_000);
  assert.equal(t.clock.running, true, 'still the rest of the window the switch was made in');
});

test('without the rule a switch carries no window flag, so the state reads as before', () => {
  let s = late({ ...HALVES, clockMode: 'running' }, 2, 30_000);
  s = at(s, stop, 2_000);
  s = at(s, running, 3_000);
  assert.equal('lastMinutes' in s.plays.at(-1), false);
});

test('clockModeAt reads the window at any moment of the running clock', () => {
  const s = late(REC, 2, 125_000);
  assert.equal(clockModeAt(s, derive(s), clockAt(s, 3_000).remainingMs), 'running');
  assert.equal(clockModeAt(s, derive(s), clockAt(s, 6_000).remainingMs), 'stop');
});

test('the rules command takes the stop clock and refuses one out of range', () => {
  let s = newGame(QUARTERS);
  s = at(s, { type: 'rules', rules: { ...REC, stopClockScope: 'game' } }, 100);
  assert.equal(s.rules.stopClockLastSeconds, 120);
  assert.equal(s.rules.stopClockScope, 'game');
  s = at(s, { type: 'rules', rules: { ...HALVES, stopClockLastSeconds: null } }, 200);
  assert.equal('stopClockLastSeconds' in s.rules, false, 'null is off, and dropped');
  assert.equal('stopClockScope' in s.rules, false);
  const refuses = (rules) =>
    assert.throws(() => at(s, { type: 'rules', rules }, 300), TrackerError);
  refuses({ ...HALVES, stopClockLastSeconds: 0 });
  refuses({ ...HALVES, stopClockLastSeconds: 601 });
  refuses({ ...HALVES, stopClockLastSeconds: 1.5 });
  refuses({ ...HALVES, periodSeconds: 300, stopClockLastSeconds: 301 });
  refuses({ ...HALVES, stopClockLastSeconds: 60, stopClockScope: 'quarter' });
});

test('the same commands give the same game on the device and on the server', async () => {
  const device = await deviceEngine();
  const commands = [
    ...lineups,
    { type: 'period', period: 2 },
    { type: 'set-clock', ms: 122_000 },
    { type: 'start' },
    foul, // 2:01 left: runs on
    timeout, // 2:00 left: stops
    { type: 'start' },
    running, // the scorer keeps it running
    foul,
    { type: 'undo' },
    { type: 'undo' },
    foul, // stops again
  ];
  const onServer = replay(server, REC, commands);
  assert.deepEqual(replay(device, REC, commands), onServer);
  assert.deepEqual(
    onServer.plays.map((p) => [p.type, p.stoppedClock ?? false]),
    [
      ['lineup', false],
      ['lineup', false],
      ['period', false],
      ['foul', false],
      ['timeout', true],
      ['foul', true],
    ],
  );
  assert.deepEqual(device.derive(onServer), server.derive(onServer));
});
