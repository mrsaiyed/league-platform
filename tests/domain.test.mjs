import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../examples/alhadi-school/src/data.js';
import * as M from '../examples/alhadi-school/src/domain.js';

test('every sample box score reconciles with its team result', () => {
  for (const g of D.games.filter((g) => g.status === 'final')) {
    for (const [id, score] of [
      [g.home, g.homeScore],
      [g.away, g.awayScore],
    ]) {
      const rows = D.box.filter((b) => b.gameId === g.id && b.team === id);
      assert.equal(
        rows.reduce((sum, b) => sum + b.points, 0),
        score,
      );
      assert.equal(
        rows.reduce((sum, b) => sum + b.seconds, 0),
        32 * 60 * 5,
      );
    }
  }
});
test('zero-point appearances count; missed games do not', () => {
  const rows = M.playerStats(D.players, D.box);
  const zero = rows.find((p) => p.id === 'p5');
  assert.equal(zero.gp, 2);
  assert.equal(zero.ppg, 0);
  assert.equal(rows.find((p) => p.id === 'p17').gp, 1);
});
test('a player with no appearance has an unknown average, not zero', () => {
  const [p] = M.playerStats([{ id: 'new' }], []);
  assert.equal(p.gp, 0);
  assert.equal(p.ppg, null);
});
test('upcoming games cannot change standings', () => {
  const before = M.standings(D.teams, D.games);
  const after = M.standings(D.teams, [
    ...D.games,
    { status: 'upcoming', home: 'falcons', away: 'lions', homeScore: 999, awayScore: 0 },
  ]);
  assert.deepEqual(before, after);
  assert.equal(before[0].wins, 2);
});
test('snake draft reverses the second round', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => M.draftTeam(i, D.teams)),
    ['falcons', 'lions', 'knights', 'eagles', 'eagles', 'knights', 'lions', 'falcons'],
  );
});
test('draft cannot pick a captain, unknown person, or already selected player', () => {
  assert.throws(() => M.draftPick({ picks: [] }, 'p0', D.players, D.teams));
  assert.throws(() => M.draftPick({ picks: [] }, 'missing', D.players, D.teams));
  const d = M.draftPick({ picks: [] }, 'p1', D.players, D.teams);
  assert.throws(() => M.draftPick(d, 'p1', D.players, D.teams));
});
test('captain consumes roster capacity', () => {
  assert.throws(() => M.draftPick({ picks: [] }, 'p1', D.players, D.teams, 1));
});
test('draft produces a new state without mutating its prior history', () => {
  const d = { picks: [] };
  const next = M.draftPick(d, 'p1', D.players, D.teams);
  assert.equal(d.picks.length, 0);
  assert.equal(next.picks.length, 1);
});
test('round robin schedules every pair once, without same-round conflicts', () => {
  const rounds = M.roundRobin(D.teams.map((t) => t.id));
  const pairs = rounds.flat().map((pair) => pair.slice().sort().join(':'));
  assert.equal(rounds.length, 3);
  assert.equal(new Set(pairs).size, 6);
  for (const round of rounds) assert.equal(new Set(round.flat()).size, round.flat().length);
});
test('odd-team round robin uses a bye without a phantom team', () => {
  const rounds = M.roundRobin(['a', 'b', 'c']);
  assert.equal(rounds.flat().length, 3);
  assert.ok(rounds.flat(2).every(Boolean));
});
test('return fixtures reverse home and away', () => {
  const rounds = M.roundRobin(['a', 'b', 'c', 'd'], 2);
  assert.deepEqual(
    rounds[3],
    rounds[0].map(([a, b]) => [b, a]),
  );
});
test('paused and finalized games do not accrue minutes', () => {
  const l = M.initialLive(D.players);
  assert.deepEqual(M.tickLive(l), l);
  const final = { ...l, running: true, final: true };
  assert.deepEqual(M.tickLive(final), final);
});
test('only on-court players accrue seconds; clock stops at zero', () => {
  const l = { ...M.initialLive(D.players), running: true, remaining: 1 };
  const next = M.tickLive(l);
  assert.equal(next.players.p0.seconds, l.players.p0.seconds + 1);
  assert.equal(next.players.p5.seconds, 0);
  assert.equal(next.players.p5.participated, false);
  assert.equal(next.remaining, 0);
  assert.equal(next.running, false);
});
