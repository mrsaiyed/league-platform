// Minutes on the game clock (S-71, step 2.189, record 077): the rule the new product
// plays by, behind `minutesFollow: 'game-clock'` in the engine's rules. In each period
// the time played is the time the period started with less what the clock shows; time
// put back comes off the players on the court; time taken off is added to them; a clock
// set wrongly and set right changes nothing; a correction never reaches into another
// period. The worked examples are those of docs/build/audits/minutes-and-a-set-clock.md,
// each with its "Right" column: the minutes AND the times of the plays. The Al-Hadi
// tracker's rule, without the field, is pinned in live-stats-set-clock-pin.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  clockSetEffect,
  derive,
  formatClock,
  formatMinutes,
  newGame,
  periodMs,
  takenBackMs,
  HALVES,
  QUARTERS,
} from '../packages/sports/src/basketball/live.ts';
import { cases, game } from './support/set-clock-cases.mjs';

const onGameClock = (rules) => ({ ...rules, minutesFollow: 'game-clock' });
const QUARTERS_G = onGameClock(QUARTERS);
const HALVES_G = onGameClock(HALVES);

const everyone = (minutes, ms, but = {}) =>
  Object.fromEntries(Object.keys(minutes).map((id) => [id, but[id] ?? ms]));
const sideTotal = (minutes, side) =>
  Object.entries(minutes)
    .filter(([id]) => id.startsWith(side === 'home' ? 'h' : 'a'))
    .reduce((sum, [, ms]) => sum + ms, 0);

test('a0: 16:55 set to 12:00 and back leaves 3:05 each, and the basket made at 19:00 reads 19:00', () => {
  const g = cases.a0(HALVES_G);
  const minutes = g.minutes();
  assert.equal(Object.keys(minutes).length, 10);
  assert.deepEqual(minutes, everyone(minutes, 185_000));
  assert.equal(formatMinutes(minutes.h1), '3:05');
  const [basket] = g.plays('score');
  assert.equal(formatClock(basket.clockMs), '19:00');
  assert.equal(basket.elapsedMs, 60_000);
  assert.equal(g.state.clock.remainingMs, 1_015_000);
  assert.deepEqual(g.state.clockSets, [], 'the set and its reversal leave nothing behind');
});

test('a: meaning 6:08, typing 0:08, then setting 6:08 gives 1:52 each', () => {
  const g = cases.a(QUARTERS_G);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 112_000));
  assert.equal(g.state.clock.remainingMs, 368_000);
});

test('b: set too high and back: h1 1:30, h6 0:30, the others 2:00; the substitution reads 6:30', () => {
  const g = cases.b(QUARTERS_G);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 120_000, { h1: 90_000, h6: 30_000 }));
  const [sub] = g.plays('sub');
  assert.equal(formatClock(sub.clockMs), '6:30');
  assert.equal(sub.elapsedMs, 90_000);
});

test('c: a clock that ran on to 5:40 and is set to 6:00 gives 2:00: that time was not played', () => {
  const minutes = cases.c(QUARTERS_G).minutes();
  assert.deepEqual(minutes, everyone(minutes, 120_000));
});

test('d: 6:00 set to 5:30 adds the 30 seconds; the quarter played out is 8:00 each and 40:00', () => {
  const g = cases.d(QUARTERS_G);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 150_000));
  g.tap({ type: 'start' }, 130_000);
  const played = g.minutes(470_000);
  assert.deepEqual(played, everyone(played, 480_000));
  assert.equal(sideTotal(played, 'home'), 2_400_000);
  assert.equal(sideTotal(played, 'away'), 2_400_000);
});

test('e: 6:00 set to 0:08, h6 in for h1, set to 6:08: h1 1:52, h6 0:00, the others 1:52', () => {
  const g = cases.e(QUARTERS_G);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 112_000, { h6: 0 }));
  const [sub] = g.plays('sub');
  assert.equal(formatClock(sub.clockMs), '6:08');
  assert.equal(sub.elapsedMs, 112_000);
});

test('f: before the second quarter, after a minute of it, and in overtime: 8:00, 9:00, 10:00', () => {
  const g = cases.f(QUARTERS_G);
  let minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 480_000));
  assert.equal(g.state.clock.remainingMs, 480_000);
  cases.f2(g);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 540_000));
  cases.f3(g);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 600_000));
  const periods = g.plays('period');
  assert.deepEqual(
    periods.map((p) => [p.period, p.clockMs, p.elapsedMs]),
    [
      [2, 480_000, 480_000],
      [5, 240_000, 540_000],
    ],
    'each period starts where the one before it ended; the first quarter is never touched',
  );
});

test('g: a set then Undo: the basket goes, the clock stays; a second set is exact', () => {
  const g = cases.g(QUARTERS_G);
  assert.equal(g.plays('score').length, 0, 'Undo took back the basket, not the clock');
  assert.equal(g.state.clock.remainingMs, 8_000);
  // As the rule says for any set: the 5:52 taken off was added to those on the court.
  let minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 472_000));
  g.tap({ type: 'set-clock', ms: 360_000 }, 123_000);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 120_000));
  assert.equal(g.state.clock.remainingMs, 360_000);
});

test('a mistake that ran on: 6:00 set to 0:08, 5 seconds run, set to 6:03 gives 1:57', () => {
  const minutes = cases.ranOn(QUARTERS_G).minutes();
  assert.deepEqual(minutes, everyone(minutes, 117_000));
});

test('above the start: 6:00 set to 9:00, 10 seconds run, set to 5:50 gives 2:10', () => {
  const minutes = cases.aboveStart(QUARTERS_G).minutes();
  assert.deepEqual(minutes, everyone(minutes, 130_000));
});

test('half a second: paused at 16:54.6, set to 12:00 and to 16:55, is back to the millisecond', () => {
  const g = cases.halfSecond(HALVES_G);
  assert.equal(g.state.clock.remainingMs, 1_014_600);
  assert.equal(g.state.clock.elapsedMs, 185_400);
  const minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 185_400));
});

// A mistaken set that ran before it was put right (the reviews of step 2.189, MEDIUM 1):
// the later set takes the earlier one back as far as it goes the other way (S-71 as
// changed on November 17). The area 6 lead's four examples, worked by hand first.
/** Taps at whole seconds from tip-off, five a side; minutes and plays as the screen reads them. */
function played(rules, taps) {
  let s = newGame(rules, 0);
  let n = 0;
  const tap = (command, at) => (s = apply(s, command, { id: `k${++n}`, now: at * 1000 }));
  tap({ type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] }, 0);
  tap({ type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] }, 0);
  tap({ type: 'start' }, 0);
  for (const [at, command] of taps) tap(command, at);
  const minutes = Object.fromEntries(
    Object.entries(derive(s).players).map(([id, line]) => [id, formatMinutes(line.ms)]),
  );
  const plays = s.plays
    .filter((p) => p.type !== 'lineup')
    .map((p) => `${p.type} ${p.playerId ?? p.inId}@${formatClock(p.clockMs)}`);
  return { minutes, plays, clock: formatClock(s.clock.remainingMs) };
}
const setTo = (seconds) => ({ type: 'set-clock', ms: seconds * 1000 });
const subIn = (side, inId, outId) => ({ type: 'sub', side, inId, outId });
const two = (side, playerId) => ({ type: 'score', side, playerId, points: 2 });
const STOP_Q = { ...QUARTERS_G, clockMode: 'stop', playerFoulLimit: 5 };
const RUNNING_H = { ...HALVES_G, clockMode: 'running', playerFoulLimit: 5 };
const some = (minutes, ids) => Object.fromEntries(ids.map((id) => [id, minutes[id]]));

test('the probe: 7:50 set by mistake, 10 seconds run, set right to 5:50: h1 1:00, h6 1:10, plays at 7:00 and 6:30', () => {
  const got = played(STOP_Q, [
    [60, subIn('home', 'h6', 'h1')],
    [90, two('home', 'h6')],
    [120, { type: 'pause' }],
    [121, setTo(470)],
    [130, { type: 'start' }],
    [140, { type: 'pause' }],
    [141, setTo(350)],
  ]);
  assert.deepEqual(some(got.minutes, ['h1', 'h6', 'h2', 'a1']), {
    h1: '1:00',
    h6: '1:10',
    h2: '2:10',
    a1: '2:10',
  });
  assert.deepEqual(got.plays, ['sub h6@7:00', 'score h6@6:30']);
  assert.equal(got.clock, '5:50');
});

test('above: meaning 17:00, setting 19:00, plays between, set to 16:30: each play keeps its own time', () => {
  const got = played(RUNNING_H, [
    [120, subIn('away', 'a6', 'a1')],
    [150, two('home', 'h1')],
    [185, { type: 'pause' }],
    [186, setTo(1140)],
    [190, { type: 'start' }],
    [200, two('away', 'a6')],
    [210, subIn('home', 'h6', 'h1')],
    [220, { type: 'pause' }],
    [221, setTo(990)],
    [230, { type: 'start' }],
    [260, { type: 'foul', side: 'away', playerId: 'a2' }],
  ]);
  assert.deepEqual(some(got.minutes, ['a1', 'a6', 'h1', 'h6', 'h2', 'a2']), {
    a1: '2:00',
    a6: '2:00',
    h1: '3:20',
    h6: '0:40',
    h2: '4:00',
    a2: '4:00',
  });
  assert.deepEqual(got.plays, [
    'sub a6@18:00',
    'score h1@17:30',
    'score a6@16:50',
    'sub h6@16:40',
    'foul a2@16:00',
  ]);
  assert.equal(got.clock, '16:00');
});

test('below: meaning 5:50, setting 0:50, plays between, set to 5:40: each play keeps its own time', () => {
  const got = played(STOP_Q, [
    [90, subIn('home', 'h6', 'h1')],
    [110, two('away', 'a1')],
    [120, { type: 'pause' }],
    [121, setTo(50)],
    [130, { type: 'start' }],
    [135, two('home', 'h2')],
    [138, subIn('away', 'a6', 'a1')],
    [140, { type: 'pause' }],
    [141, setTo(340)],
    [150, { type: 'start' }],
    [180, two('home', 'h6')],
  ]);
  assert.deepEqual(some(got.minutes, ['h1', 'h6', 'a1', 'a6', 'h2', 'a2']), {
    h1: '1:30',
    h6: '1:20',
    a1: '2:18',
    a6: '0:32',
    h2: '2:50',
    a2: '2:50',
  });
  assert.deepEqual(got.plays, [
    'sub h6@6:30',
    'score a1@6:10',
    'score h2@5:45',
    'sub a6@5:42',
    'score h6@5:10',
  ]);
  assert.equal(got.clock, '5:10');
});

test('two real corrections in opposite directions are read as the second taking back the first', () => {
  const got = played(RUNNING_H, [
    [305, { type: 'pause' }],
    [306, setTo(915)],
    [307, subIn('away', 'a6', 'a1')],
    [315, { type: 'start' }],
    [375, two('away', 'a6')],
    [435, setTo(780)],
  ]);
  assert.deepEqual(some(got.minutes, ['a1', 'a6', 'h1']), { a1: '5:00', a6: '2:00', h1: '7:00' });
  assert.deepEqual(got.plays, ['sub a6@15:00', 'score a6@14:00']);
  assert.equal(got.clock, '13:00');
});

test('set forward then back leaves every minute and every play time as they were', () => {
  const g = game(QUARTERS_G)
    .tap({ type: 'score', side: 'home', playerId: 'h2', points: 3 }, 20_000)
    .tap({ type: 'sub', side: 'away', inId: 'a6', outId: 'a3' }, 70_000)
    .tap({ type: 'foul', side: 'home', playerId: 'h4' }, 100_000);
  const before = structuredClone(g.state);
  for (const ms of [0, 8_000, 300_000, 470_000, 480_000]) {
    g.tap({ type: 'set-clock', ms }, 101_000).tap({ type: 'set-clock', ms: 380_000 }, 101_000);
    assert.deepEqual(derive(g.state), derive(before), `via ${formatClock(ms)}`);
    assert.deepEqual(g.state.plays, before.plays);
    assert.deepEqual(g.state.clock.remainingMs, before.clock.remainingMs);
    assert.deepEqual(g.state.clock.elapsedMs, before.clock.elapsedMs);
  }
});

test('set back alone takes off exactly what was put back, and never below zero', () => {
  let g = game(QUARTERS_G).tap({ type: 'pause' }, 120_000);
  g.tap({ type: 'set-clock', ms: 390_000 }, 121_000);
  let minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 90_000), '30 seconds put back, 30 off');
  g = game(QUARTERS_G).tap({ type: 'pause' }, 120_000);
  g.tap({ type: 'set-clock', ms: 1_200_000 }, 121_000);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 0), 'more than was played: down to 0:00, no lower');
  // Never into another period: a minute into Q2, 20:00 put back takes only Q2's minute.
  g = cases
    .f(QUARTERS_G)
    .tap({ type: 'start' }, 500_000)
    .tap({ type: 'pause' }, 560_000)
    .tap({ type: 'set-clock', ms: 1_200_000 }, 561_000);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 480_000));
});

test('undo of a period drops its sets and its running time; redo starts it now', () => {
  const g = game(QUARTERS_G)
    .tap({ type: 'pause' }, 120_000)
    .tap({ type: 'period', period: 2 }, 121_000)
    .tap({ type: 'start' }, 122_000)
    .tap({ type: 'pause' }, 152_000)
    .tap({ type: 'set-clock', ms: 300_000 }, 153_000)
    .tap({ type: 'undo' }, 154_000);
  assert.equal(derive(g.state).period, 1);
  assert.equal(g.state.clock.remainingMs, 360_000);
  let minutes = g.minutes();
  assert.deepEqual(
    minutes,
    everyone(minutes, 120_000),
    'the 30 seconds and the set count for nobody',
  );
  assert.ok(g.state.clockSets.every((e) => e.segment === 0));
  g.tap({ type: 'start' }, 160_000).tap({ type: 'pause' }, 170_000);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 130_000));
  g.tap({ type: 'redo' }, 171_000);
  assert.equal(derive(g.state).period, 2);
  assert.equal(g.state.clock.remainingMs, 480_000);
  const [period] = g.plays('period');
  assert.equal(period.elapsedMs, 130_000);
  assert.equal(period.clockMs, 480_000);
  g.tap({ type: 'start' }, 180_000).tap({ type: 'pause' }, 200_000);
  minutes = g.minutes();
  assert.deepEqual(minutes, everyone(minutes, 150_000));
});

test('the reckoning holds while the clock runs, and a reload reads the same', () => {
  const g = game(QUARTERS_G)
    .tap({ type: 'pause' }, 120_000)
    .tap({ type: 'set-clock', ms: 540_000 }, 121_000)
    .tap({ type: 'start' }, 130_000);
  // Running from 9:00 in an 8:00 quarter: the first minute above the start is not played.
  assert.equal(g.minutes(160_000).h1, 0);
  assert.equal(g.minutes(250_000).h1, 60_000);
  const saved = JSON.parse(JSON.stringify(g.state));
  const next = apply(saved, { type: 'pause' }, { id: 'x', now: 250_000 });
  assert.equal(derive(next).players.h1.ms, 60_000);
});

test('the form’s helper says what a set will do, from the engine itself', () => {
  const at16 = game(HALVES_G).tap({ type: 'pause' }, 185_000);
  assert.deepEqual(clockSetEffect(at16.state, 720_000, 186_000), {
    kind: 'added',
    ms: 295_000,
    takesBackMs: 0,
  });
  assert.deepEqual(clockSetEffect(at16.state, 1_100_000, 186_000), {
    kind: 'back',
    ms: 85_000,
    wholePeriod: false,
    takesBackMs: 0,
  });
  assert.deepEqual(clockSetEffect(at16.state, 1_200_000, 186_000), {
    kind: 'back',
    ms: 185_000,
    wholePeriod: true,
    takesBackMs: 0,
  });
  assert.deepEqual(clockSetEffect(at16.state, 1_015_000, 186_000), { kind: 'none' });
  at16.tap({ type: 'set-clock', ms: 720_000 }, 186_000);
  assert.deepEqual(
    clockSetEffect(at16.state, 1_015_000, 187_000),
    { kind: 'back', ms: 295_000, wholePeriod: false, takesBackMs: 295_000 },
    'back from 12:00 to 16:55 takes back the 4:55 it added, not the half',
  );
  // A mistake that ran, put right (the reviews' probe): 7:50 at 6:00, 10 seconds, then
  // 5:50 takes all 1:50 of it back; 4:00 takes it back and adds 1:50 more.
  const probe = game(QUARTERS_G)
    .tap({ type: 'pause' }, 120_000)
    .tap({ type: 'set-clock', ms: 470_000 }, 121_000)
    .tap({ type: 'start' }, 130_000)
    .tap({ type: 'pause' }, 140_000);
  assert.deepEqual(clockSetEffect(probe.state, 350_000, 141_000), {
    kind: 'added',
    ms: 110_000,
    takesBackMs: 110_000,
  });
  assert.deepEqual(clockSetEffect(probe.state, 240_000, 141_000), {
    kind: 'added',
    ms: 220_000,
    takesBackMs: 110_000,
  });
  const putRight = apply(
    probe.state,
    { type: 'set-clock', ms: 350_000 },
    { id: 'p', now: 141_000 },
  );
  assert.equal(takenBackMs(probe.state.clock.elapsedMs, putRight), 110_000);
  // Before the clock has run in a period, a set only says where it starts.
  const second = cases.f(QUARTERS_G);
  assert.deepEqual(clockSetEffect(second.state, 420_000, 493_000), { kind: 'start' });
  assert.deepEqual(clockSetEffect(newGame(QUARTERS_G, 0), 300_000, 0), { kind: 'start' });
  // A set the engine refuses does nothing; the input is never changed.
  const frozen = structuredClone(at16.state);
  assert.deepEqual(clockSetEffect(at16.state, -1, 188_000), { kind: 'none' });
  assert.deepEqual(at16.state, frozen);
  // On the tracker's rule it says what that rule does: the whole half, and nothing added.
  const old = game(HALVES).tap({ type: 'pause' }, 185_000);
  assert.deepEqual(clockSetEffect(old.state, 720_000, 186_000), { kind: 'none' });
  old.tap({ type: 'set-clock', ms: 720_000 }, 186_000);
  assert.deepEqual(clockSetEffect(old.state, 1_015_000, 187_000), {
    kind: 'back',
    ms: 185_000,
    wholePeriod: true,
    takesBackMs: 0,
  });
  // Once that rule has wiped the half, a lower set moves nobody's minutes, but the half
  // has run: it is not said to start there (the reviews' LOW 5).
  old.tap({ type: 'set-clock', ms: 1_015_000 }, 187_000);
  assert.equal(old.state.clock.elapsedMs, 0);
  assert.deepEqual(clockSetEffect(old.state, 600_000, 188_000), { kind: 'none' });
  // Before it has run, it is.
  assert.deepEqual(clockSetEffect(game(HALVES).state, 600_000, 0), { kind: 'start' });
});

test('the rules command keeps minutes on the game clock; reset keeps it too', () => {
  let s = newGame(QUARTERS_G, 0);
  s = apply(s, { type: 'rules', rules: HALVES }, { id: 'r', now: 0 });
  assert.equal(s.rules.minutesFollow, 'game-clock');
  assert.equal(s.rules.periods, 2);
  // The tracker's own rules command can never turn it on.
  let t = newGame(QUARTERS, 0);
  t = apply(t, { type: 'rules', rules: HALVES_G }, { id: 'r', now: 0 });
  assert.equal('minutesFollow' in t.rules, false);
  const g = cases.a(QUARTERS_G).tap({ type: 'reset' }, 200_000);
  assert.equal(g.state.rules.minutesFollow, 'game-clock');
  assert.deepEqual(g.state.clockSets, []);
  assert.equal(g.state.clock.ranMs, 0);
});

// ------------------------------------------------------------ properties over random taps

/** A small seeded generator, so a failure is the same failure each run. */
function random(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
}

/** Random taps on one game: start, pause, sets up to the period's length, subs, periods, undo, redo. */
function randomGame(seed, rules, taps = 80) {
  const r = random(seed);
  const pick = (list) => list[Math.floor(r() * list.length)];
  let now = 0;
  let n = 0;
  let s = newGame(rules, 0);
  const tap = (command) => (s = apply(s, command, { id: `p${seed}-${++n}`, now }));
  tap({ type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] });
  tap({ type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] });
  const bench = { home: ['h6', 'h7'], away: ['a6', 'a7'] };
  const history = [s];
  for (let i = 0; i < taps; i++) {
    now += 1000 * Math.floor(r() * 40);
    const d = derive(s);
    const roll = r();
    try {
      if (roll < 0.2) tap({ type: s.clock.running ? 'pause' : 'start' });
      else if (roll < 0.45) {
        const length = periodMs(rules, d.period);
        tap({ type: 'set-clock', ms: 1000 * Math.floor((r() * length) / 1000) });
      } else if (roll < 0.6) {
        const side = pick(['home', 'away']);
        const off = pick(d.teams[side].onCourt);
        const on = pick(bench[side].filter((id) => !d.teams[side].onCourt.includes(id)));
        if (off && on) {
          tap({ type: 'sub', side, inId: on, outId: off });
          bench[side] = [...bench[side].filter((id) => id !== on), off];
        }
      } else if (roll < 0.68)
        tap({ type: 'period', period: Math.min(d.period + 1, rules.periods + 2) });
      // Five on throughout: the lineups are never taken back.
      else if (roll < 0.78) {
        if (s.plays.at(-1)?.type !== 'lineup') tap({ type: 'undo' });
      } else if (roll < 0.86) tap({ type: 'redo' });
      else {
        // A basket by one of that team's own players on the court (the reviews' LOW 6).
        const side = pick(['home', 'away']);
        tap({ type: 'score', side, playerId: pick(d.teams[side].onCourt), points: 2 });
      }
    } catch {
      // A tap the engine refuses (a period already being played, nothing to undo): skipped.
    }
    // The bench follows the floor again after an undo or a redo of a substitution.
    for (const side of ['home', 'away']) {
      const all =
        side === 'home'
          ? ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7']
          : ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
      bench[side] = all.filter((id) => !derive(s).teams[side].onCourt.includes(id));
    }
    history.push(s);
  }
  return history;
}

/** The start of each period played, as its period play (or the game) says, and its share. */
function periodShares(s) {
  const starts = [];
  let first = s.clockSets.find((e) => e.segment === 0 && e.ranMs === 0)?.ms ?? periodMs(s.rules, 1);
  starts.push({ length: first, from: 0 });
  for (const p of s.plays)
    if (p.type === 'period') starts.push({ length: p.clockMs, from: p.elapsedMs });
  return starts.map((start, i) => ({
    length: start.length,
    share: (starts[i + 1]?.from ?? s.clock.elapsedMs) - start.from,
  }));
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

test('the random taps reach what the properties are about', () => {
  const reached = { sets: 0, setsLater: 0, periods: 0, periodsUndone: 0, subs: 0, putBack: 0 };
  for (const seed of SEEDS) {
    const history = randomGame(seed, QUARTERS_G);
    for (const [i, s] of history.entries()) {
      const before = history[i - 1];
      if (s.clockSets.length > 0) reached.sets += 1;
      if (s.clockSets.some((e) => e.segment > 0)) reached.setsLater += 1;
      if (s.plays.some((p) => p.type === 'sub')) reached.subs += 1;
      if (before && s.clock.elapsedMs < before.clock.elapsedMs) reached.putBack += 1;
      if (s.plays.at(-1)?.type === 'period') reached.periods += 1;
      if (s.redo.at(-1)?.type === 'period' && before?.plays.at(-1)?.type === 'period')
        reached.periodsUndone += 1;
    }
  }
  for (const [what, count] of Object.entries(reached)) assert.ok(count >= 20, `${what}: ${count}`);
});

test('property: five on throughout totals five times the game time; each period is its start less its clock', () => {
  for (const seed of SEEDS)
    for (const rules of [QUARTERS_G, HALVES_G])
      for (const s of randomGame(seed, rules)) {
        const minutes = Object.fromEntries(
          Object.entries(derive(s).players).map(([id, l]) => [id, l.ms]),
        );
        for (const side of ['home', 'away'])
          assert.equal(sideTotal(minutes, side), 5 * s.clock.elapsedMs, `seed ${seed}`);
        const shares = periodShares(s);
        for (const { length, share } of shares) {
          assert.ok(
            share >= 0 && share <= length,
            `seed ${seed}: a share of ${share} in ${length}`,
          );
        }
        const last = shares.at(-1);
        assert.equal(
          last.share,
          last.length - Math.min(last.length, s.clock.remainingMs),
          `seed ${seed}`,
        );
      }
});

test('property: every player is between 0 and the sum of the periods’ starts', () => {
  for (const seed of SEEDS)
    for (const s of randomGame(seed, QUARTERS_G)) {
      const most = periodShares(s).reduce((sum, p) => sum + p.length, 0);
      for (const line of Object.values(derive(s).players))
        assert.ok(line.ms >= 0 && line.ms <= most, `seed ${seed}: ${line.ms} of ${most}`);
    }
});

/** Everything a set must leave alone or decide, without the command ids and times of the taps. */
const reckoned = (s) => ({
  derived: derive(s),
  plays: s.plays,
  redo: s.redo,
  remainingMs: s.clock.remainingMs,
  elapsedMs: s.clock.elapsedMs,
});

test('property: at a stopped moment, set X and then back is as if neither; set X then Y is set Y', () => {
  for (const seed of SEEDS)
    for (const [i, s] of randomGame(seed, QUARTERS_G, 50).entries()) {
      if (s.clock.running || s.status === 'final' || i % 3 !== 0) continue;
      const now = s.lastAt;
      const set = (state, ms) => apply(state, { type: 'set-clock', ms }, { id: 'q', now });
      const shown = s.clock.remainingMs;
      for (const x of [0, 7_000, Math.floor(shown / 2000) * 1000, 300_000, 480_000]) {
        assert.deepEqual(reckoned(set(set(s, x), shown)), reckoned(s), `seed ${seed}, via ${x}`);
        for (const y of [5_000, 240_000, 480_000])
          assert.deepEqual(
            reckoned(set(set(s, x), y)),
            reckoned(set(s, y)),
            `seed ${seed}, ${x} then ${y}`,
          );
      }
    }
});

test('property: a play’s game time never goes down along the log', () => {
  for (const seed of SEEDS)
    for (const rules of [QUARTERS_G, HALVES_G])
      for (const s of randomGame(seed, rules)) {
        let last = 0;
        for (const p of s.plays) {
          assert.ok(p.elapsedMs >= last, `seed ${seed}: ${p.type} at ${p.elapsedMs} after ${last}`);
          last = p.elapsedMs;
        }
        assert.ok(s.clock.elapsedMs >= last, `seed ${seed}: the clock behind its plays`);
      }
});

test('property: a mistake that ran, put right to what the clock would show, is as if never made', () => {
  let tried = 0;
  for (const seed of Array.from({ length: 400 }, (_, i) => i + 1)) {
    const r = random(seed * 7919);
    const whole = (most) => 1000 * Math.floor(r() * (most / 1000));
    const rules = r() < 0.5 ? QUARTERS_G : HALVES_G;
    const length = periodMs(rules, 1);
    // A first stretch of the period, the same in both games, then a stop.
    const played = 1000 + whole(length / 2);
    const prefix = [{ type: 'pause' }];
    let base = newGame(rules, 0);
    let n = 0;
    const tap = (s, command, at) => apply(s, command, { id: `m${seed}-${n++}`, now: at });
    base = tap(
      base,
      { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
      0,
    );
    base = tap(
      base,
      { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
      0,
    );
    base = tap(base, { type: 'start' }, 0);
    base = tap(base, subIn('home', 'h6', 'h1'), whole(played));
    for (const command of prefix) base = tap(base, command, played);
    const reading = base.clock.remainingMs;
    // The mistake: any whole second up to the period's start, two seconds or more off.
    const mistake = whole(length + 1000);
    const run = 1000 + whole(Math.min(reading, mistake) - 2000);
    if (Math.abs(mistake - reading) < 2000 || run >= Math.min(reading, mistake)) continue;
    // The same taps in the stretch the clock then runs, in both games.
    const during = [
      [1000 + whole(run - 1000), two('away', 'a3')],
      [1000 + whole(run - 1000), subIn('away', 'a6', 'a2')],
    ].sort((x, y) => x[0] - y[0]);
    const afterwards = (s, wrong) => {
      let t = played + 1000;
      if (wrong) s = tap(s, { type: 'set-clock', ms: mistake }, t);
      s = tap(s, { type: 'start' }, t);
      for (const [at, command] of during) s = tap(s, command, t + at);
      s = tap(s, { type: 'pause' }, t + run);
      return s;
    };
    n = 1000;
    const never = afterwards(base, false);
    n = 1000;
    let mistaken = afterwards(base, true);
    // Put right to what the clock would show, had the mistake never been made.
    mistaken = tap(
      mistaken,
      { type: 'set-clock', ms: never.clock.remainingMs },
      played + 1000 + run + 1000,
    );
    tried += 1;
    const stamps = (s) =>
      s.plays.map(({ type, clockMs, elapsedMs }) => ({ type, clockMs, elapsedMs }));
    assert.deepEqual(derive(mistaken), derive(never), `seed ${seed}: ${mistake} ran ${run}`);
    assert.deepEqual(stamps(mistaken), stamps(never), `seed ${seed}: ${mistake} ran ${run}`);
  }
  assert.ok(tried >= 200, `${tried} mistakes tried`);
});
