// The mercy rule (P7 §1 and §5.2, S-21, T-128; step 2.67): under a stop clock, the basket
// that brings a team's lead up to the chosen number switches to a running clock, and the
// tracker says so. The scorer can switch it back. Off when the format leaves it out.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  clockModeAt,
  derive,
  newGame,
  HALVES,
  QUARTERS,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';
import * as server from '../packages/sports/src/basketball/live.ts';
import { deviceEngine, replay } from './support/device-engine.mjs';

let n = 0;
const at = (state, command, now) => apply(state, command, { id: `m${++n}`, now });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
];
const home = (points) => ({ type: 'score', side: 'home', playerId: 'h1', points });
const away = (points) => ({ type: 'score', side: 'away', playerId: 'a1', points });
const foul = { type: 'foul', side: 'away', playerId: 'a2' };
const stop = { type: 'clock-mode', mode: 'stop' };
/** A stop clock that turns into a running clock at a 10-point lead. */
const MERCY = { ...HALVES, mercyLead: 10 };

/** A game under way at t=1000, then `scores` one second apart; the clock left running. */
function scored(rules, scores) {
  let s = newGame(rules, 0);
  for (const c of lineups) s = at(s, c, 500);
  s = at(s, { type: 'start' }, 1_000);
  scores.forEach((c, i) => (s = at(s, c, 2_000 + 1_000 * i)));
  return s;
}

test('without the rule a big lead changes nothing, so a game reads as before', () => {
  const s = scored(HALVES, [home(3), home(3), home(3), home(3)]);
  assert.equal('mercyLead' in s.rules, false);
  assert.equal(derive(s).clockMode, 'stop');
  assert.equal(
    s.plays.some((p) => 'mercyClock' in p),
    false,
  );
  const t = scored({ ...HALVES, mercyLead: null }, [home(3), home(3), home(3), home(3)]);
  assert.equal(derive(t).clockMode, 'stop');
});

test('the basket that reaches the lead switches to a running clock, and is marked', () => {
  let s = scored(MERCY, [home(3), home(3), home(2)]);
  assert.equal(derive(s).clockMode, 'stop', 'an 8-point lead is short of it');
  s = at(s, home(2), 6_000);
  const basket = s.plays.at(-1);
  assert.equal(basket.mercyClock, true);
  assert.equal(derive(s).teams.home.score, 10);
  assert.equal(derive(s).clockMode, 'running');
  assert.equal(clockModeAt(s), 'running');
  assert.equal(s.clock.running, true, 'the switch leaves the clock as it was');
  s = at(s, foul, 7_000);
  assert.equal(s.clock.running, true, 'a foul now leaves the clock running');
  assert.equal(s.plays.at(-1).stoppedClock, undefined);
});

test('either team can reach it, and a basket past it counts as reaching it', () => {
  const s = scored(MERCY, [away(3), away(3), away(3), away(2)]);
  assert.equal(s.plays.at(-1).mercyClock, true);
  assert.equal(derive(s).clockMode, 'running');
  const past = scored(MERCY, [home(3), home(3), home(3), home(3)]);
  assert.equal(past.plays.at(-1).mercyClock, true, '9 to 12 passes 10');
});

test('undoing the basket undoes the switch; redoing it brings it back', () => {
  let s = scored(MERCY, [home(3), home(3), home(2), home(2)]);
  s = at(s, { type: 'undo' }, 7_000);
  assert.equal(derive(s).clockMode, 'stop');
  assert.equal(derive(s).teams.home.score, 8);
  s = at(s, foul, 8_000);
  assert.equal(s.clock.running, false, 'back under a stop clock, a foul stops it');
  s = at(s, { type: 'undo' }, 9_000);
  s = at(s, { type: 'redo' }, 10_000);
  assert.equal(s.plays.at(-1).type, 'foul');
  // Redo of the basket itself.
  let r = scored(MERCY, [home(3), home(3), home(2), home(2)]);
  r = at(r, { type: 'undo' }, 7_000);
  r = at(r, { type: 'redo' }, 8_000);
  assert.equal(r.plays.at(-1).mercyClock, true);
  assert.equal(derive(r).clockMode, 'running');
});

test('the scorer can switch it back, and a bigger lead does not switch it again', () => {
  let s = scored(MERCY, [home(3), home(3), home(2), home(2)]);
  s = at(s, stop, 7_000);
  assert.equal(derive(s).clockMode, 'stop');
  s = at(s, home(3), 8_000);
  assert.equal(s.plays.at(-1).mercyClock, undefined);
  assert.equal(derive(s).clockMode, 'stop');
  s = at(s, foul, 9_000);
  assert.equal(s.clock.running, false);
  // The lead drops below and reaches it again: the switch happens again.
  s = at(s, { type: 'start' }, 10_000);
  s = at(s, away(3), 11_000); // 13–3
  s = at(s, away(2), 12_000); // 13–5: 8 points
  assert.equal(derive(s).clockMode, 'stop');
  s = at(s, home(2), 13_000); // 15–5
  assert.equal(s.plays.at(-1).mercyClock, true);
  assert.equal(derive(s).clockMode, 'running');
  // Undoing the scorer's switch back puts the running clock back too.
  let u = scored(MERCY, [home(3), home(3), home(2), home(2)]);
  u = at(u, stop, 7_000);
  u = at(u, { type: 'undo' }, 8_000);
  assert.equal(derive(u).clockMode, 'running');
});

test('under a running clock the rule has nothing to switch', () => {
  const s = scored({ ...MERCY, clockMode: 'running' }, [home(3), home(3), home(2), home(2)]);
  assert.equal(s.plays.at(-1).mercyClock, undefined);
  assert.equal(derive(s).clockMode, 'running');
});

test('the mercy switch does not override a last-minutes stop clock', () => {
  // A season cannot set both (a mercy rule is for a stop clock, the last-minutes stop clock
  // for a running one), but the engine takes either, so it says how they meet: the running
  // clock the mercy rule brings still stops in the last minutes; the scorer can override.
  let s = newGame({ ...MERCY, stopClockLastSeconds: 60 }, 0);
  for (const c of lineups) s = at(s, c, 500);
  s = at(s, { type: 'period', period: 2 }, 600);
  s = at(s, { type: 'set-clock', ms: 70_000 }, 700);
  s = at(s, { type: 'start' }, 1_000);
  for (const [i, c] of [home(3), home(3), home(2), home(2)].entries()) s = at(s, c, 2_000 + i);
  assert.equal(s.plays.at(-1).mercyClock, true);
  s = at(s, foul, 3_000); // 1:08 left
  assert.equal(s.clock.running, true);
  s = at(s, foul, 12_000); // 0:59 left
  assert.equal(s.clock.running, false);
});

test('the rules command takes a mercy lead and refuses one out of range', () => {
  let s = newGame(QUARTERS);
  s = at(s, { type: 'rules', rules: MERCY }, 100);
  assert.equal(s.rules.mercyLead, 10);
  s = at(s, { type: 'rules', rules: { ...HALVES, mercyLead: null } }, 200);
  assert.equal('mercyLead' in s.rules, false, 'null is off, and dropped');
  for (const mercyLead of [0, 101, 2.5, '20'])
    assert.throws(
      () => at(s, { type: 'rules', rules: { ...HALVES, mercyLead } }, 300),
      TrackerError,
    );
});

test('the same commands give the same game on the device and on the server', async () => {
  const device = await deviceEngine();
  const commands = [
    ...lineups,
    { type: 'start' },
    home(3),
    home(3),
    home(2),
    home(2), // 10 points: running clock
    foul,
    { type: 'undo' },
    { type: 'undo' }, // the basket: stop clock again
    foul, // stops the clock
    { type: 'start' },
    home(3), // 11 points: running again
    stop, // the scorer switches back
    foul,
  ];
  const onServer = replay(server, MERCY, commands);
  assert.deepEqual(replay(device, MERCY, commands), onServer);
  assert.deepEqual(
    onServer.plays
      .filter((p) => p.type !== 'lineup')
      .map((p) => [p.type, p.mercyClock ?? false, p.stoppedClock ?? false]),
    [
      ['score', false, false],
      ['score', false, false],
      ['score', false, false],
      ['foul', false, true],
      ['score', true, false],
      ['clock-mode', false, false],
      ['foul', false, true],
    ],
  );
  assert.deepEqual(device.derive(onServer), server.derive(onServer));
});
