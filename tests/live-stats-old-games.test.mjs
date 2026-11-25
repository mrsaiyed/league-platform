// The law of step 2.247 (T-432): a game with no `unscore`, which is every game recorded
// before it, reads through today's engine exactly as through the engine before it.
// `support/old-games-before.json` was made once by running the engine of `build/stage-1`
// before the step (20c39416) on nine fixed seeded games, refusals included: each step's
// state and derived numbers (as a hash of their JSON, so key order counts too), each
// refusal's words, and at the end the derived numbers, the clock, the running score,
// every play's words and whether the game has statistics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as engine from '../packages/sports/src/basketball/live.ts';

const before = JSON.parse(
  await readFile(new URL('./support/old-games-before.json', import.meta.url), 'utf8'),
);
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const names = (id) => `#${id}`;
const teams = (side) => (side === 'home' ? 'Home' : 'Away');

/** What today's engine makes of a game's commands, in the shape the file was made in. */
function readGame(rules, list) {
  let state = engine.newGame(rules);
  const steps = [];
  for (const { command, id, now } of list) {
    try {
      state = engine.apply(state, command, { id, now });
      steps.push(hash([state, engine.derive(state)]));
    } catch (error) {
      if (!(error instanceof engine.TrackerError)) throw error;
      steps.push(`refused: ${error.message}`);
    }
  }
  return {
    steps,
    state: hash(state),
    derived: engine.derive(state),
    clockLater: engine.clockAt(state, state.lastAt + 5_000),
    running: engine.runningScores(state.plays).map((s) => `${s.home}-${s.away}`),
    words: state.plays.map((p) => engine.describePlay(p, names, teams, rules.periods)),
    hasRecordedStats: engine.hasRecordedStats(state),
  };
}

test('the file holds nine games, none with a take-back, with refusals and baskets', () => {
  assert.equal(before.games.length, 9);
  for (const game of before.games) {
    assert.ok(
      game.commands.every(({ command }) => command.type !== 'unscore'),
      game.name,
    );
    assert.ok(
      game.commands.some(({ command }) => command.type === 'score'),
      game.name,
    );
    assert.ok(
      game.expected.steps.some((s) => s.startsWith('refused: ')),
      game.name,
    );
  }
});

for (const game of before.games)
  test(`${game.name}: a game with no take-back reads as before step 2.247`, () => {
    const now = readGame(game.rules, game.commands);
    // The end first, so a difference shows as numbers rather than as a hash.
    assert.deepEqual(now.derived, game.expected.derived);
    assert.deepEqual(now.words, game.expected.words);
    assert.deepEqual(now.running, game.expected.running);
    assert.deepEqual(now.clockLater, game.expected.clockLater);
    assert.equal(now.hasRecordedStats, game.expected.hasRecordedStats);
    assert.deepEqual(now.steps, game.expected.steps);
    assert.equal(now.state, game.expected.state);
  });
