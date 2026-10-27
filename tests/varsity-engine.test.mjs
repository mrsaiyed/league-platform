import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  initialGame,
  currentGame,
  reduceCommand,
  teamTotals,
} from '../packages/sports/src/basketball/scorer.ts';
import { Command } from '../packages/contracts/src/varsity.ts';

const rules = { periods: 4, periodSeconds: 480, overtimeSeconds: 240 };
function fixture() {
  const players = ['home', 'away'].flatMap((side) =>
    Array.from({ length: 6 }, (_, i) => ({
      id: randomUUID(),
      name: `${side} ${i}`,
      jersey: String(i),
      side,
    })),
  );
  let state = initialGame(players, rules, 'home', 0);
  for (const side of ['home', 'away'])
    state = reduceCommand(
      state,
      {
        type: 'lineup',
        side,
        playerIds: players
          .filter((p) => p.side === side)
          .slice(0, 5)
          .map((p) => p.id),
      },
      randomUUID(),
      0,
    );
  return {
    state,
    players,
    home: players.filter((p) => p.side === 'home'),
    away: players.filter((p) => p.side === 'away'),
  };
}
const apply = (state, input, at = 0) =>
  reduceCommand(state, Command.parse(input), randomUUID(), at);

test('lineup selection is not an appearance; starting creates zero-point appearances but not bench GP', () => {
  const { state, home } = fixture();
  assert.equal(state.players[home[0].id].appeared, false);
  const live = apply(state, { type: 'start' });
  assert.equal(live.players[home[0].id].appeared, true);
  assert.equal(live.players[home[5].id].appeared, false);
  assert.equal(live.players[home[0].id].points, 0);
});
test('server clock and substitutions preserve integer minutes and lineup conservation', () => {
  let { state, home } = fixture();
  state = apply(state, { type: 'start' });
  state = apply(
    state,
    { type: 'substitute', side: 'home', outId: home[0].id, inId: home[5].id },
    61500,
  );
  state = apply(state, { type: 'pause' }, 123000);
  assert.equal(state.players[home[0].id].milliseconds, 61500);
  assert.equal(state.players[home[5].id].milliseconds, 61500);
  assert.equal(
    home.reduce((sum, p) => sum + state.players[p.id].milliseconds, 0),
    5 * 123000,
  );
  assert.equal(currentGame(state, 500000).remainingMs, state.remainingMs);
});
test('made baskets reconcile; correction retains evidence and cannot subtract twice', () => {
  let { state, home } = fixture();
  state = apply(state, { type: 'start' });
  for (const points of [1, 2, 3])
    state = apply(state, { type: 'score', playerId: home[0].id, points });
  assert.equal(teamTotals(state, 'home').score, 6);
  const targetId = state.events.at(-1).id;
  state = apply(state, { type: 'undo', targetId });
  assert.equal(teamTotals(state, 'home').score, 3);
  assert.equal(state.players[home[0].id].threes, 0);
  assert.equal(state.events.find((e) => e.id === targetId).reversed, true);
  assert.throws(() => apply(state, { type: 'undo', targetId }), /unreversed/);
});
test('lineup and event validation reject wrong-side, duplicate, bench and unknown players', () => {
  let { state, home, away } = fixture();
  assert.throws(
    () => apply(state, { type: 'lineup', side: 'home', playerIds: [away[0].id] }),
    /other team/,
  );
  assert.throws(
    () => apply(state, { type: 'lineup', side: 'home', playerIds: [home[0].id, home[0].id] }),
    /once/,
  );
  state = apply(state, { type: 'start' });
  assert.throws(
    () => apply(state, { type: 'score', playerId: home[5].id, points: 2 }),
    /Substitute/,
  );
  assert.throws(() => apply(state, { type: 'score', playerId: randomUUID(), points: 2 }), /not in/);
  assert.throws(() => Command.parse({ type: 'score', playerId: home[0].id, points: -1 }));
});
test('background elapsed time stops at period boundary; period fouls reset without erasing personal fouls', () => {
  let { state, home } = fixture();
  state = apply(state, { type: 'start' });
  state = apply(state, { type: 'foul', playerId: home[0].id }, 1000);
  const later = currentGame(state, 999999);
  assert.equal(later.remainingMs, 0);
  assert.equal(later.running, false);
  assert.equal(later.players[home[0].id].milliseconds, 480000);
  state = apply(state, { type: 'next-period' }, 999999);
  assert.equal(state.period, 2);
  assert.equal(state.remainingMs, 480000);
  assert.equal(teamTotals(state, 'home').periodFouls, 0);
  assert.equal(state.players[home[0].id].fouls, 1);
});
test('midgame clock adjustment flags minutes, and finalized records require an explicit reasoned reopening', () => {
  let { state, home } = fixture();
  state = apply(state, { type: 'start' });
  state = apply(state, { type: 'pause' }, 5000);
  state = apply(state, { type: 'clock', seconds: 478, reason: 'Clock ran during timeout' }, 5000);
  assert.equal(state.minutesQuality, 'review-required');
  state = apply(state, { type: 'finalize' }, 5000);
  assert.throws(
    () => apply(state, { type: 'score', playerId: home[0].id, points: 2 }, 5000),
    /Reopen/,
  );
  state = apply(state, { type: 'reopen', reason: 'Correct a recorded basket' }, 5000);
  assert.equal(state.status, 'live');
  assert.equal(state.running, false);
});
