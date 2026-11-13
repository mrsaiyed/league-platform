// The clock mode (S-21, T-128; step 2.66): a stop clock stops on fouls and timeouts,
// a running clock keeps going, and the scorer can switch between them mid-game.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  clockAt,
  clockModeOf,
  derive,
  describePlay,
  newGame,
  HALVES,
  QUARTERS,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';

let n = 0;
const at = (state, command, now) => apply(state, command, { id: `m${++n}`, now });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
];
const foul = { type: 'foul', side: 'home', playerId: 'h1' };
const timeout = { type: 'timeout', side: 'away', seconds: 60 };
const running = { type: 'clock-mode', mode: 'running' };
const stop = { type: 'clock-mode', mode: 'stop' };

/** A game with lineups set and the clock started at t=1000. */
function underway(rules) {
  let s = newGame(rules, 0);
  for (const c of lineups) s = at(s, c, 500);
  return at(s, { type: 'start' }, 1_000);
}

test('rules without a clock mode mean a stop clock, as every game before the mode', () => {
  assert.equal(clockModeOf(QUARTERS), 'stop');
  assert.equal(clockModeOf(HALVES), 'stop');
  assert.equal(clockModeOf({ ...QUARTERS, clockMode: 'running' }), 'running');
  const s = newGame(QUARTERS);
  assert.equal('clockMode' in s.rules, false);
  assert.equal(derive(s).clockMode, 'stop');
});

test('under a stop clock a foul and a timeout stop the clock', () => {
  let s = underway({ ...QUARTERS, clockMode: 'stop' });
  s = at(s, foul, 5_000);
  assert.equal(s.clock.running, false);
  assert.equal(s.plays.at(-1).stoppedClock, true);
  s = at(s, { type: 'start' }, 6_000);
  s = at(s, timeout, 8_000);
  assert.equal(s.clock.running, false);
  assert.equal(s.plays.at(-1).stoppedClock, true);
});

test('under a running clock a foul and a timeout leave the clock running', () => {
  let s = underway({ ...QUARTERS, clockMode: 'running' });
  assert.equal(derive(s).clockMode, 'running');
  s = at(s, foul, 5_000);
  assert.equal(s.clock.running, true);
  assert.equal(s.plays.at(-1).stoppedClock, undefined);
  assert.equal(s.plays.at(-1).clockMs, 8 * 60_000 - 4_000);
  s = at(s, timeout, 8_000);
  assert.equal(s.clock.running, true);
  assert.equal(s.plays.at(-1).stoppedClock, undefined);
  // Fouls and timeouts still count as before; only the clock differs.
  const d = derive(s);
  assert.equal(d.teams.home.fouls, 1);
  assert.equal(d.teams.away.timeouts.length, 1);
  assert.equal(clockAt(s, 10_000).remainingMs, 8 * 60_000 - 9_000);
  // The scorer can still stop it by hand.
  s = at(s, { type: 'pause' }, 10_000);
  assert.equal(s.clock.running, false);
});

test('the rules command takes a clock mode before tip-off and refuses a wrong one', () => {
  let s = newGame(QUARTERS);
  s = at(s, { type: 'rules', rules: { ...HALVES, clockMode: 'running' } }, 100);
  assert.equal(s.rules.clockMode, 'running');
  assert.equal(derive(s).clockMode, 'running');
  s = at(s, { type: 'rules', rules: HALVES }, 200);
  assert.equal('clockMode' in s.rules, false);
  assert.throws(
    () => at(s, { type: 'rules', rules: { ...HALVES, clockMode: 'sometimes' } }, 300),
    TrackerError,
  );
});

test('switching to a running clock mid-game: fouls stop stopping the clock', () => {
  let s = underway(QUARTERS);
  s = at(s, foul, 3_000);
  assert.equal(s.clock.running, false);
  s = at(s, { type: 'start' }, 4_000);
  s = at(s, running, 5_000);
  // The switch itself leaves the clock as it was, and is in the event log.
  assert.equal(s.clock.running, true);
  const sw = s.plays.at(-1);
  assert.equal(sw.type, 'clock-mode');
  assert.equal(sw.mode, 'running');
  assert.equal(sw.id, `m${n}`);
  assert.equal(sw.clockMs, 8 * 60_000 - 3_000);
  assert.equal(derive(s).clockMode, 'running');
  s = at(s, foul, 6_000);
  assert.equal(s.clock.running, true);
  // And back to a stop clock.
  s = at(s, stop, 7_000);
  assert.equal(derive(s).clockMode, 'stop');
  s = at(s, foul, 8_000);
  assert.equal(s.clock.running, false);
  assert.equal(derive(s).teams.home.fouls, 3);
});

test('switching to a stop clock under a running-clock format', () => {
  let s = underway({ ...HALVES, clockMode: 'running' });
  s = at(s, stop, 2_000);
  s = at(s, foul, 3_000);
  assert.equal(s.clock.running, false);
  assert.equal(s.plays.at(-1).stoppedClock, true);
});

test('the switch can be undone and redone, and the mode follows', () => {
  let s = underway(QUARTERS);
  s = at(s, running, 2_000);
  s = at(s, { type: 'undo' }, 3_000);
  assert.equal(derive(s).clockMode, 'stop');
  assert.equal(
    s.plays.some((p) => p.type === 'clock-mode'),
    false,
  );
  assert.equal(s.redo.at(-1).type, 'clock-mode');
  assert.equal(s.clock.running, true, 'undoing the switch does not touch the clock');
  s = at(s, foul, 4_000);
  assert.equal(s.clock.running, false, 'back under a stop clock, a foul stops it');
  s = at(s, { type: 'undo' }, 5_000);
  s = at(s, { type: 'redo' }, 6_000);
  assert.equal(s.plays.at(-1).type, 'foul');
  // Redo of the switch itself.
  let r = underway(QUARTERS);
  r = at(r, running, 2_000);
  r = at(r, { type: 'undo' }, 3_000);
  r = at(r, { type: 'redo' }, 4_000);
  assert.equal(derive(r).clockMode, 'running');
  r = at(r, foul, 5_000);
  assert.equal(r.clock.running, true);
});

test('a switch to the mode already on is refused, and so is an unknown mode', () => {
  const s = underway(QUARTERS);
  assert.throws(() => at(s, stop, 2_000), /already stops on fouls/);
  const t = at(s, running, 2_000);
  assert.throws(() => at(t, running, 3_000), /already running through fouls/);
  assert.throws(() => at(s, { type: 'clock-mode', mode: 'fast' }, 2_000), TrackerError);
});

test('switching before tip-off does not make the game live; a final game refuses it', () => {
  let s = at(newGame(QUARTERS), running, 100);
  assert.equal(s.status, 'scheduled');
  assert.equal(derive(s).clockMode, 'running');
  s = at(s, { type: 'start' }, 200);
  s = at(s, { type: 'score', side: 'home', playerId: 'h1', points: 2 }, 300);
  s = at(s, { type: 'end' }, 400);
  assert.throws(() => at(s, stop, 500), /final/);
});

test('the same commands give the same game wherever they are applied', () => {
  const commands = [
    ...lineups,
    { type: 'start' },
    foul,
    { type: 'start' },
    running,
    foul,
    timeout,
    { type: 'undo' },
    stop,
    foul,
  ];
  const play = () => {
    let s = newGame(QUARTERS, 0);
    commands.forEach((c, i) => (s = apply(s, c, { id: `same${i}`, now: 1_000 * (i + 1) })));
    return s;
  };
  assert.deepEqual(play(), play());
  const s = play();
  assert.deepEqual(
    s.plays.map((p) => [p.type, p.stoppedClock ?? false]),
    [
      ['lineup', false],
      ['lineup', false],
      ['foul', true],
      ['clock-mode', false],
      ['foul', false],
      ['clock-mode', false],
      ['foul', true],
    ],
  );
});

test('the play log describes the switch', () => {
  const name = (id) => id;
  assert.equal(describePlay(running, name), 'Running clock on');
  assert.equal(describePlay(stop, name), 'Stop clock on');
});
