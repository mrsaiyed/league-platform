// The personal foul limit (P7 §1, S-21, T-128; step 2.67): a player with the limit's
// number of fouls standing is marked out, or never when there is no limit. Off when the
// format leaves it out, so a game reads as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LiveStats } from '../apps/live-stats/service.ts';
import { MemoryRepository } from '../packages/database/src/live-stats/memory.ts';
import {
  apply,
  derive,
  newGame,
  HALVES,
  QUARTERS,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';
import * as server from '../packages/sports/src/basketball/live.ts';
import { deviceEngine, replay } from './support/device-engine.mjs';

let n = 0;
const at = (state, command, now) => apply(state, command, { id: `f${++n}`, now });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
];
const foul = (playerId = 'h1') => ({ type: 'foul', side: 'home', playerId });
const unfoul = (playerId = 'h1') => ({ type: 'unfoul', side: 'home', playerId });
/** Halves with a player out at five fouls, as P7's default. */
const LIMIT = { ...HALVES, playerFoulLimit: 5 };

/** A game with lineups set, then `commands` one second apart. */
function played(rules, commands) {
  let s = newGame(rules, 0);
  for (const c of lineups) s = at(s, c, 500);
  commands.forEach((c, i) => (s = at(s, c, 1_000 * (i + 1))));
  return s;
}

test('without a limit no player is ever marked out, so a game reads as before', async () => {
  const s = played(HALVES, Array(8).fill(foul()));
  assert.equal(derive(s).players.h1.fouls, 8);
  assert.equal('fouledOut' in derive(s).players.h1, false);
  assert.equal('playerFoulLimit' in s.rules, false);
  const none = played({ ...HALVES, playerFoulLimit: null }, Array(8).fill(foul()));
  assert.equal('fouledOut' in derive(none).players.h1, false);
  // A game saved before the rule, read now, has no player marked out.
  const before = JSON.parse(
    await readFile(new URL('./support/clock-mode-before.json', import.meta.url), 'utf8'),
  );
  for (const l of Object.values(derive(before.state).players))
    assert.equal('fouledOut' in l, false);
});

test('the foul that reaches the limit marks the player out', () => {
  let s = played(LIMIT, Array(4).fill(foul()));
  assert.equal('fouledOut' in derive(s).players.h1, false, 'four is one short');
  s = at(s, foul(), 10_000);
  const d = derive(s);
  assert.equal(d.players.h1.fouls, 5);
  assert.equal(d.players.h1.fouledOut, true);
  assert.equal('fouledOut' in d.players.h2, false);
  // Marked, not removed: the player stays on the floor until the scorer subs them off,
  // and a further foul still counts.
  assert.ok(d.teams.home.onCourt.includes('h1'));
  s = at(s, foul(), 11_000);
  assert.equal(derive(s).players.h1.fouls, 6);
  assert.equal(derive(s).players.h1.fouledOut, true);
  s = at(s, { type: 'sub', side: 'home', inId: 'h6', outId: 'h1' }, 12_000);
  s = at(s, { type: 'sub', side: 'home', inId: 'h1', outId: 'h6' }, 13_000);
  assert.ok(derive(s).teams.home.onCourt.includes('h1'), 'bringing them back is the scorer’s call');
});

test('undo, redo and a foul taken back all move the mark with the count', () => {
  let s = played(LIMIT, Array(5).fill(foul()));
  s = at(s, { type: 'undo' }, 10_000);
  assert.equal('fouledOut' in derive(s).players.h1, false);
  s = at(s, { type: 'redo' }, 11_000);
  assert.equal(derive(s).players.h1.fouledOut, true);
  s = at(s, unfoul(), 12_000);
  assert.equal(derive(s).players.h1.fouls, 4);
  assert.equal('fouledOut' in derive(s).players.h1, false);
  s = at(s, { type: 'undo' }, 13_000);
  assert.equal(derive(s).players.h1.fouledOut, true);
});

test('a limit of one, and fouls across periods all count', () => {
  const one = played({ ...QUARTERS, playerFoulLimit: 1 }, [foul('h2')]);
  assert.equal(derive(one).players.h2.fouledOut, true);
  let s = played(LIMIT, [foul(), foul(), { type: 'period', period: 2 }, foul(), foul(), foul()]);
  assert.equal(derive(s).players.h1.fouledOut, true);
  s = at(s, { type: 'period', period: 3 }, 10_000);
  assert.equal(derive(s).players.h1.fouledOut, true, 'still out in overtime');
});

test('the rules command takes a limit and refuses one out of range', () => {
  let s = newGame(QUARTERS);
  s = at(s, { type: 'rules', rules: LIMIT }, 100);
  assert.equal(s.rules.playerFoulLimit, 5);
  s = at(s, { type: 'rules', rules: { ...HALVES, playerFoulLimit: null } }, 200);
  assert.equal('playerFoulLimit' in s.rules, false, 'null is no limit, and dropped');
  for (const playerFoulLimit of [0, 21, 4.5, '5'])
    assert.throws(
      () => at(s, { type: 'rules', rules: { ...HALVES, playerFoulLimit } }, 300),
      TrackerError,
    );
});

test('the same commands give the same game on the device and on the server', async () => {
  const device = await deviceEngine();
  const commands = [
    ...lineups,
    ...Array(5).fill(foul()),
    { type: 'undo' },
    { type: 'redo' },
    unfoul(),
    foul('h2'),
    foul(),
  ];
  const onServer = replay(server, LIMIT, commands);
  assert.deepEqual(replay(device, LIMIT, commands), onServer);
  const d = server.derive(onServer);
  assert.deepEqual(device.derive(onServer), d);
  assert.equal(d.players.h1.fouledOut, true);
  assert.equal('fouledOut' in d.players.h2, false);
});

test('the mark is not saved in a player line, so the stored format stays as it was', async () => {
  // The Al-Hadi tracker never sends the limit; a game whose rules carry one stands in here.
  class WithLimit extends MemoryRepository {
    record(gameId, commandId, decide) {
      return super.record(gameId, commandId, (game) =>
        decide({
          ...game,
          state: { ...game.state, rules: { ...game.state.rules, playerFoulLimit: 1 } },
        }),
      );
    }
  }
  const seed = JSON.parse(
    await readFile(
      new URL('../apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json', import.meta.url),
    ),
  );
  const repo = new WithLimit();
  await repo.initialize();
  const stats = new LiveStats(repo, () => Date.parse('2026-11-02T19:05:00-06:00'));
  await stats.seed(seed);
  const g = (await stats.schedule()).games[0];
  const player = await stats.addPlayer(g.home.id, { name: 'Player 1', jersey: '1' });
  const send = (input) => stats.command(g.id, { commandId: randomUUID(), input });
  await send({ type: 'lineup', side: 'home', playerIds: [player.id] });
  await send({ type: 'foul', side: 'home', playerId: player.id });
  const state = (await repo.game(g.id)).state;
  assert.equal(derive(state).players[player.id].fouledOut, true, 'the engine marks the player');
  const [line] = await repo.gameLines(g.id);
  assert.equal(line.fouls, 1);
  assert.equal('fouledOut' in line, false);
});
