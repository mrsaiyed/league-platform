// The Al-Hadi tracker's rule for a set clock, pinned as it is (step 2.189, record 077).
// The engine learned a second rule, minutes on the game clock (S-71), behind one field
// of its rules that only the new product sets. Without that field, which is every game
// of the tracker and every game saved before it, a set clock must do exactly what it
// did: these tests fail if that rule moves by one millisecond. They hold today's
// results, faults included (a clock set wrongly and put right wipes the period's
// minutes); the new product's results are in live-stats-game-clock-minutes.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  apply,
  derive,
  newGame,
  HALVES,
  QUARTERS,
} from '../packages/sports/src/basketball/live.ts';
import { cases } from './support/set-clock-cases.mjs';

const everyone = (minutes, ms, but = {}) =>
  Object.fromEntries(Object.keys(minutes).map((id) => [id, but[id] ?? ms]));

const homeTotal = (minutes) =>
  Object.entries(minutes)
    .filter(([id]) => id.startsWith('h'))
    .reduce((sum, [, ms]) => sum + ms, 0);

test('a fixed game of sets, periods, undo and redo gives the very state it gave before', async () => {
  // Recorded with the engine as it was before step 2.189 (lane/2.189-minutes-set-clock
  // at 859d25e): two games, every command with its time, the state and what it derives.
  const before = JSON.parse(
    await readFile(new URL('./support/set-clock-before.json', import.meta.url), 'utf8'),
  );
  for (const [name, rules] of [
    ['quarters', QUARTERS],
    ['halves', HALVES],
  ]) {
    const pinned = before[name];
    assert.deepEqual(pinned.rules, rules, `${name}: the tracker's own rules`);
    assert.equal('minutesFollow' in pinned.state.rules, false);
    let s = newGame(rules, 0);
    pinned.steps.forEach(({ command, now }, i) => (s = apply(s, command, { id: `pin${i}`, now })));
    assert.deepEqual(s, pinned.state, `${name}: the whole state`);
    assert.deepEqual(derive(s), pinned.derived, `${name}: what it derives`);
    assert.equal('ranMs' in s.clock, false, 'no fact of the new rule is kept');
    assert.equal('clockSets' in s, false);
    assert.ok(s.plays.every((p) => !('ranMs' in p)));
  }
});

test('a0: 16:55 set to 12:00 and back wipes the half, and the basket at 19:00 reads 16:55', () => {
  const g = cases.a0(HALVES);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 0));
  assert.equal(Object.keys(minutes).length, 10);
  const [basket] = g.plays('score');
  assert.equal(basket.clockMs, 1_015_000);
  assert.equal(basket.elapsedMs, 0);
});

test('a: 6:00 set to 0:08 and then 6:08 wipes the quarter', () => {
  const minutes = cases.a(QUARTERS).minutes();
  assert.deepEqual(minutes, everyone(minutes, 0));
});

test('b: 6:00 set to 7:30 and back loses 1:30, and the substitution reads 7:30', () => {
  const g = cases.b(QUARTERS);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 30_000, { h6: 0 }));
  const [sub] = g.plays('sub');
  assert.equal(sub.clockMs, 450_000);
  assert.equal(sub.elapsedMs, 30_000);
});

test('c: a clock that ran on to 5:40, set to 6:00, gives back the 20 seconds', () => {
  const minutes = cases.c(QUARTERS).minutes();
  assert.deepEqual(minutes, everyone(minutes, 120_000));
});

test('d: 6:00 set to 5:30 gives nobody the 30 seconds: a whole quarter reads 7:30', () => {
  const g = cases.d(QUARTERS);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 120_000));
  g.tap({ type: 'start' }, 130_000);
  const played = g.minutes(470_000);
  assert.deepEqual(played, everyone(played, 450_000));
  assert.equal(homeTotal(played), 5 * 450_000, 'the team: 37:30');
});

test('e: 6:00 set to 0:08, a substitution, set to 6:08 wipes the quarter', () => {
  const g = cases.e(QUARTERS);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 0));
  assert.equal(g.plays('sub')[0].clockMs, 368_000);
});

test('f: each period loses its minute to a set and back; the first quarter is never touched', () => {
  const g = cases.f(QUARTERS);
  let minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 480_000));
  cases.f2(g);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 480_000));
  cases.f3(g);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 480_000));
});

test('g: a set then Undo takes the basket back, leaves the clock at 0:08 and minutes at 2:00', () => {
  const g = cases.g(QUARTERS);
  assert.equal(g.plays('score').length, 0);
  assert.equal(g.state.clock.remainingMs, 8_000);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 120_000));
});

test('the three more: a mistake that ran on, a set above the start, half a second', () => {
  let minutes = cases.ranOn(QUARTERS).minutes();
  assert.deepEqual(minutes, everyone(minutes, 0));
  minutes = cases.aboveStart(QUARTERS).minutes();
  assert.deepEqual(minutes, everyone(minutes, 10_000));
  const half = cases.halfSecond(HALVES);
  minutes = half.minutes();
  assert.deepEqual(minutes, everyone(minutes, 0));
  assert.equal(half.state.clock.remainingMs, 1_015_000);
});
