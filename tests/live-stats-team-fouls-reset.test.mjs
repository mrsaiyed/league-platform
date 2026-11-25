// When team fouls reset (P7 §1 "When team fouls reset", S-21, S-106; step 2.123, the 2.107
// audit's finding M8): each period, each half or once a game, and the bonus and the double
// bonus follow that count. Absent means each period, so every game saved before it, and
// every game of the Al-Hadi tracker, reads exactly as before. Overtime continues the last
// regulation window's count (S-114).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  derive,
  foulWindow,
  newGame,
  HALVES,
  QUARTERS,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';
import { deviceEngine, replay } from './support/device-engine.mjs';

let n = 0;
const at = (state, command, now) => apply(state, command, { id: `t${++n}`, now });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
];
const HOME = ['h1', 'h2', 'h3', 'h4', 'h5'];
/** A home foul, spread over the five on the floor so nobody's limit matters. */
const foul = (i = 0) => ({ type: 'foul', side: 'home', playerId: HOME[i % 5] });
const period = (p) => ({ type: 'period', period: p });
/** Quarters with the bonus on the 7th team foul and the double bonus on the 10th. */
const Q7 = { ...QUARTERS, bonusFouls: 7, doubleBonusFouls: 10 };

/** A game with lineups set, then `commands` one second apart. */
function played(rules, commands) {
  let s = newGame(rules, 0);
  for (const c of lineups) s = at(s, c, 500);
  commands.forEach((c, i) => (s = at(s, c, 1_000 * (i + 1))));
  return s;
}
const fouls = (count, from = 0) => Array.from({ length: count }, (_, i) => foul(from + i));

test("the audit's example: quarters, 4 fouls in Q1 and 3 in Q2, by the half, is 7 and the bonus in Q2", () => {
  const plays = [...fouls(4), period(2), ...fouls(3, 4)];
  const half = derive(played({ ...Q7, teamFoulsReset: 'half' }, plays));
  assert.equal(half.period, 2);
  assert.equal(half.teams.home.periodFouls, 7);
  assert.equal(half.teams.away.bonus, 1, 'the visitors shoot the bonus');
  assert.equal(half.teams.home.penalty, 1);
  assert.equal(half.teams.home.bonus, 0);
  // Each period, the same plays are 3 in Q2 and no bonus, as before.
  for (const rules of [Q7, { ...Q7, teamFoulsReset: 'period' }]) {
    const each = derive(played(rules, plays));
    assert.equal(each.teams.home.periodFouls, 3);
    assert.equal(each.teams.away.bonus, 0);
  }
});

test('by the half the count starts again in Q3, and Q4 adds to it', () => {
  const rules = { ...Q7, teamFoulsReset: 'half' };
  const plays = [...fouls(4), period(2), ...fouls(3, 4), period(3)];
  assert.equal(derive(played(rules, plays)).teams.home.periodFouls, 0);
  const second = derive(played(rules, [...plays, ...fouls(6), period(4), ...fouls(4, 6)]));
  assert.equal(second.teams.home.periodFouls, 10);
  assert.equal(second.teams.away.bonus, 2, 'the double bonus on the 10th of the half');
});

test('once a game every foul counts, in halves and in quarters', () => {
  const halves = { ...HALVES, teamFoulsReset: 'game' };
  const h = derive(played(halves, [...fouls(4), period(2), ...fouls(3, 4)]));
  assert.equal(h.teams.home.periodFouls, 7);
  assert.equal(h.teams.away.bonus, 1);
  const quarters = { ...Q7, teamFoulsReset: 'game' };
  const plays = [foul(), period(2), foul(1), period(3), foul(2), period(4), foul(3)];
  assert.equal(derive(played(quarters, plays)).teams.home.periodFouls, 4);
  // With halves, each half is each period.
  const byHalf = derive(
    played({ ...HALVES, teamFoulsReset: 'half' }, [...fouls(4), period(2), foul()]),
  );
  assert.equal(byHalf.teams.home.periodFouls, 1);
});

test('overtime continues the last regulation window: the period, the half or the game (S-114)', () => {
  const plays = [
    foul(),
    period(2),
    foul(1),
    period(3),
    foul(2),
    period(4),
    foul(3),
    period(5),
    foul(4),
  ];
  const count = (reset) =>
    derive(played({ ...Q7, ...(reset ? { teamFoulsReset: reset } : {}) }, plays)).teams.home
      .periodFouls;
  assert.equal(count(undefined), 2, 'Q4 and overtime, as before');
  assert.equal(count('period'), 2);
  assert.equal(count('half'), 3, 'the second half and overtime');
  assert.equal(count('game'), 5);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((p) => foulWindow({ ...Q7, teamFoulsReset: 'half' }, p)),
    [1, 1, 2, 2, 2, 2],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map((p) => foulWindow(HALVES, p)),
    [1, 2, 2, 2],
  );
});

test('undo, a foul taken back and redo give the right count by the half', () => {
  const rules = { ...Q7, teamFoulsReset: 'half' };
  let s = played(rules, [...fouls(4), period(2), ...fouls(3, 4)]);
  assert.equal(derive(s).teams.away.bonus, 1);
  s = at(s, { type: 'undo' }, 20_000);
  assert.equal(derive(s).teams.home.periodFouls, 6);
  assert.equal(derive(s).teams.away.bonus, 0, 'the bonus goes with the 7th foul');
  s = at(s, { type: 'redo' }, 21_000);
  assert.equal(derive(s).teams.home.periodFouls, 7);
  // Taking back h1's latest foul, made in Q1, still counts in this half.
  s = at(s, { type: 'unfoul', side: 'home', playerId: 'h1' }, 22_000);
  assert.equal(derive(s).teams.home.periodFouls, 6);
  assert.equal(derive(s).teams.away.bonus, 0);
});

test('a foul moved back across a period line counts in the window it is moved into', () => {
  const rules = { ...Q7, teamFoulsReset: 'half' };
  // The scorer moved on to Q3 too early, recorded a foul, then went back to Q2.
  let s = played(rules, [...fouls(4), period(2), ...fouls(2, 4), period(3), foul(1)]);
  assert.equal(derive(s).teams.home.periodFouls, 1);
  s = at(s, period(2), 20_000);
  assert.equal(derive(s).teams.home.periodFouls, 6, 'the Q3 foul is not in the first half');
  // The same foul moved onto Q2, as a correction of the grid moves it, is the 7th.
  const moved = {
    ...s,
    plays: s.plays.map((p, i, all) => (i === all.length - 2 ? { ...p, period: 2 } : p)),
  };
  assert.equal(moved.plays.at(-2).type, 'foul');
  assert.equal(derive(moved).teams.home.periodFouls, 7);
  assert.equal(derive(moved).teams.away.bonus, 1);
  // Each period, it would be 3 in Q2.
  assert.equal(derive({ ...moved, rules: Q7 }).teams.home.periodFouls, 3);
});

test('a format keeps its reset when given one, refuses a wrong one, and leaves it out when absent', () => {
  const set = (rules) => at(newGame(QUARTERS, 0), { type: 'rules', rules }, 0);
  assert.equal(set({ ...Q7, teamFoulsReset: 'half' }).rules.teamFoulsReset, 'half');
  assert.equal(set({ ...Q7, teamFoulsReset: 'game' }).rules.teamFoulsReset, 'game');
  assert.equal('teamFoulsReset' in set(Q7).rules, false);
  assert.throws(() => set({ ...Q7, teamFoulsReset: 'quarter' }), TrackerError);
});

test("the scorer's device engine counts the same way", async () => {
  const engine = await deviceEngine();
  const commands = [...lineups, ...fouls(4), period(2), ...fouls(3, 4)];
  for (const reset of [undefined, 'period', 'half', 'game']) {
    const rules = { ...Q7, ...(reset ? { teamFoulsReset: reset } : {}) };
    assert.deepEqual(
      engine.derive(replay(engine, rules, commands)),
      derive(replay({ apply, newGame }, rules, commands)),
    );
  }
});

/** A small seeded random number generator (mulberry32), so a failure can be replayed. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random command a scorer might send, refused or not. */
function randomCommand(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const side = pick(['home', 'away']);
  const playerId = `${side[0]}${1 + Math.floor(random() * 5)}`;
  return pick([
    () => ({ type: 'foul', side, playerId }),
    () => ({ type: 'foul', side, playerId }),
    () => ({ type: 'foul', side, playerId }),
    () => ({ type: 'unfoul', side, playerId }),
    () => ({ type: 'score', side, playerId, points: pick([1, 2, 3]) }),
    () => ({ type: 'period', period: 1 + Math.floor(random() * 6) }),
    () => ({ type: 'undo' }),
    () => ({ type: 'redo' }),
    () => ({ type: 'start' }),
    () => ({ type: 'pause' }),
    () => ({ type: 'set-clock', ms: Math.floor(random() * 480) * 1_000 }),
    () => ({ type: 'timeout', side, seconds: pick([60, 30]) }),
  ])();
}

test('for the same plays, each period with the field absent and present give the same game (ten seeds)', () => {
  for (const rules of [Q7, HALVES]) {
    for (let seed = 1; seed <= 10; seed += 1) {
      const random = seeded(seed);
      let absent = newGame(rules, 0);
      let present = newGame({ ...rules, teamFoulsReset: 'period' }, 0);
      for (const [i, c] of lineups.entries()) {
        absent = apply(absent, c, { id: `l${i}`, now: 500 });
        present = apply(present, c, { id: `l${i}`, now: 500 });
      }
      let refused = 0;
      for (let i = 1; i <= 300; i += 1) {
        const command = randomCommand(random);
        const ctx = { id: `r${seed}-${i}`, now: 1_000 * i };
        const run = (state) => {
          try {
            return apply(state, command, ctx);
          } catch (error) {
            if (!(error instanceof TrackerError)) throw error;
            return error.message;
          }
        };
        const a = run(absent);
        const p = run(present);
        assert.equal(typeof a, typeof p, `seed ${seed}, play ${i}: ${JSON.stringify(command)}`);
        if (typeof a === 'string') {
          assert.equal(a, p);
          refused += 1;
          continue;
        }
        absent = a;
        present = p;
        assert.deepEqual(derive(present), derive(absent), `seed ${seed}, play ${i}`);
      }
      const { teamFoulsReset, ...rest } = present.rules;
      assert.equal(teamFoulsReset, 'period');
      assert.deepEqual({ ...present, rules: rest }, absent, `seed ${seed}: only the field differs`);
      assert.ok(refused < 300 && absent.plays.length > 20, `seed ${seed} played a real game`);
    }
  }
});
