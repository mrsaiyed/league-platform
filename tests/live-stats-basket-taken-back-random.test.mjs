// The proof of step 2.247 (T-432): for many random games, a game with one basket taken
// back equals, in every number, the same game in which that basket was never made. Only
// the play list differs, by the basket's line and the take-back's. Ten seeds here; set
// BASKET_SEEDS to run more by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  clockAt,
  derive,
  HALVES,
  newGame,
  QUARTERS,
  runningScores,
  scoreByPeriod,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';

const SEEDS = Number(process.env.BASKET_SEEDS ?? 10);
const FORMATS = {
  quarters: QUARTERS,
  halves: HALVES,
  'foul limit': { ...QUARTERS, playerFoulLimit: 5 },
  'game clock': { ...HALVES, minutesFollow: 'game-clock' },
};
const HOME = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'];
const AWAY = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random game: the commands the engine took, each with its id and time. */
function randomGame(seed, rules) {
  const r = random(seed);
  const pick = (list) => list[Math.floor(r() * list.length)];
  let state = newGame(rules);
  let now = 1000;
  const taken = [];
  const take = (command) => {
    try {
      state = apply(state, command, { id: `p${taken.length}`, now });
      taken.push({ command, id: `p${taken.length}`, now });
    } catch (error) {
      if (!(error instanceof TrackerError)) throw error;
    }
  };
  take({ type: 'lineup', side: 'home', playerIds: HOME.slice(0, 5) });
  take({ type: 'lineup', side: 'away', playerIds: AWAY.slice(0, 5) });
  for (let i = 0; i < 160; i += 1) {
    now += Math.floor(r() * 20_000);
    const side = r() < 0.5 ? 'home' : 'away';
    const court = derive(state).teams[side].onCourt;
    const bench = (side === 'home' ? HOME : AWAY).filter((id) => !court.includes(id));
    const roll = r();
    if (roll < 0.35) take({ type: 'score', side, playerId: pick(court), points: pick([1, 2, 3]) });
    else if (roll < 0.47) take({ type: 'foul', side, playerId: pick(court) });
    else if (roll < 0.52) take({ type: 'unfoul', side, playerId: pick(court) });
    else if (roll < 0.58) take({ type: 'turnover', side, playerId: pick(court) });
    else if (roll < 0.61) take({ type: 'team-turnover', side });
    else if (roll < 0.64) take({ type: 'timeout', side, seconds: pick([60, 30]) });
    else if (roll < 0.72) take({ type: 'sub', side, inId: pick(bench), outId: pick(court) });
    else if (roll < 0.84) take({ type: state.clock.running ? 'pause' : 'start' });
    else if (roll < 0.88) take({ type: 'period', period: derive(state).period + 1 });
    else if (roll < 0.91) take({ type: 'clock-mode', mode: pick(['stop', 'running']) });
    else if (roll < 0.94) take({ type: 'set-clock', ms: Math.floor(r() * 60) * 1000 });
  }
  return { taken, r };
}

/** Every command again, each with its own id and time; a refusal is a failure here. */
function replay(rules, list) {
  return list.reduce(
    (state, { command, id, now }) => apply(state, command, { id, now }),
    newGame(rules),
  );
}

for (const [name, rules] of Object.entries(FORMATS))
  test(`${name}: a basket taken back reads as one never made, ${SEEDS} seeds`, () => {
    let compared = 0;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const { taken, r } = randomGame(seed * 7919 + name.length, rules);
      const baskets = taken.flatMap((t, i) => (t.command.type === 'score' ? [i] : []));
      if (!baskets.length) continue;
      const k = baskets[Math.floor(r() * baskets.length)];
      const at = k + 1 + Math.floor(r() * (taken.length - k));
      const { command, id } = taken[k];
      const previous = taken[at - 1];
      const unscore = {
        command: {
          type: 'unscore',
          side: command.side,
          playerId: command.playerId,
          points: command.points,
          playId: id,
        },
        id: 'take-back',
        now: previous.now,
      };
      const withTakeBack = replay(rules, [...taken.slice(0, at), unscore, ...taken.slice(at)]);
      const neverMade = replay(
        rules,
        taken.filter((_, i) => i !== k),
      );

      assert.deepEqual(derive(withTakeBack), derive(neverMade), `seed ${seed}`);
      assert.deepEqual(scoreByPeriod(withTakeBack.plays), scoreByPeriod(neverMade.plays));
      assert.deepEqual(
        runningScores(withTakeBack.plays).at(-1),
        runningScores(neverMade.plays).at(-1),
      );
      // The clock at one moment after both; `anchorAt` is only when it was last read.
      const end = Math.max(withTakeBack.lastAt, neverMade.lastAt);
      const clock = (state) => ({ ...clockAt(state, end), anchorAt: end });
      assert.deepEqual(clock(withTakeBack), clock(neverMade));
      assert.equal(withTakeBack.status, neverMade.status);
      const twoLines = new Set([id, 'take-back']);
      assert.deepEqual(
        withTakeBack.plays.filter((p) => !twoLines.has(p.id)),
        neverMade.plays,
      );
      assert.equal(withTakeBack.plays.length, neverMade.plays.length + 2);
      compared += 1;
    }
    assert.ok(compared >= SEEDS / 2, `only ${compared} games had a basket`);
  });
