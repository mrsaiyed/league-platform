import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { LiveStatsStore, StoreError } from '../packages/database/src/live-stats/store.ts';
import { TrackerError } from '../packages/sports/src/basketball/live.ts';

const seed = JSON.parse(
  await readFile(
    new URL('../apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json', import.meta.url),
  ),
);

async function open() {
  let now = Date.parse('2026-11-02T19:05:00-06:00');
  const db = new PGlite();
  const store = new LiveStatsStore(db, () => now);
  await store.initialize();
  await store.seed(seed);
  return { db, store, tick: (ms) => (now += ms) };
}
const send = (store, gameId, input, commandId = randomUUID()) =>
  store.command(gameId, { commandId, input });

test('the TCSAAL schedule seeds once, in date order, with Al-Hadi as the tracked team', async () => {
  const { store } = await open();
  await store.seed(seed);
  const { team, games } = await store.schedule();
  assert.equal(team.name, 'Al-Hadi');
  assert.equal(games.length, 10);
  assert.equal(games[0].sourceRef, 'tcsaal:653');
  assert.equal(games[0].away.name, 'Al-Hadi');
  assert.equal(games[0].home.name, 'KIPP Academy West');
  assert.equal(games[0].startsAt, '2026-11-03T01:00:00.000Z');
  assert.equal(games[0].gameType, 'exhibition');
  assert.ok(games.every((g, i) => i === 0 || g.startsAt >= games[i - 1].startsAt));
  assert.equal((await store.teams()).length, 6);
});

test('rosters take any number of players, by name, jersey or both', async () => {
  const { store } = await open();
  const { team } = await store.schedule();
  for (let i = 0; i < 40; i++)
    await store.addPlayer(team.id, { name: `Player ${i}`, jersey: String(i % 100) });
  await store.addPlayer(team.id, { name: '', jersey: '00' });
  await store.addPlayer(team.id, { name: 'No Number', jersey: '' });
  await assert.rejects(store.addPlayer(team.id, { name: '', jersey: '' }), /name or a jersey/);
  await assert.rejects(store.addPlayer(team.id, { name: 'X', jersey: '100' }), /0–99/);
  const roster = await store.team(team.id);
  assert.equal(roster.players.length, 42);
  assert.deepEqual(
    roster.players.slice(0, 3).map((p) => p.jersey),
    ['00', '0', '1'],
  );
  assert.equal(roster.players.at(-1).name, 'No Number');
});

test('every accepted action saves the state, the event and the box score lines', async () => {
  const { db, store, tick } = await open();
  const { games } = await store.schedule();
  const g = games[0];
  const home = await Promise.all(
    [1, 2, 3, 4, 5].map((j) => store.addPlayer(g.home.id, { name: '', jersey: String(j) })),
  );
  const away = await Promise.all(
    [10, 11, 12, 13, 14, 15].map((j) =>
      store.addPlayer(g.away.id, { name: `Lion ${j}`, jersey: String(j) }),
    ),
  );
  await send(store, g.id, { type: 'lineup', side: 'home', playerIds: home.map((p) => p.id) });
  await send(store, g.id, {
    type: 'lineup',
    side: 'away',
    playerIds: away.slice(0, 5).map((p) => p.id),
  });
  await send(store, g.id, { type: 'start' });
  tick(30_000);
  const id = randomUUID();
  const first = await send(
    store,
    g.id,
    { type: 'score', side: 'away', playerId: away[0].id, points: 3 },
    id,
  );
  assert.equal(first.changed, true);
  const again = await send(
    store,
    g.id,
    { type: 'score', side: 'away', playerId: away[0].id, points: 3 },
    id,
  );
  assert.equal(again.changed, false, 'a retried action is applied once');
  assert.equal(again.game.awayScore, 3);
  assert.equal(again.game.status, 'live');
  assert.equal(again.game.revision, 4);

  const events = await db.query(
    'SELECT count(*)::int AS n FROM live_stats.game_events WHERE game_id = $1',
    [g.id],
  );
  assert.equal(events.rows[0].n, 4);
  const lines = await db.query(
    'SELECT name, jersey, points, fg3, ms, appeared FROM live_stats.player_game_lines WHERE game_id = $1 AND player_id = $2',
    [g.id, away[0].id],
  );
  assert.deepEqual(lines.rows[0], {
    name: 'Lion 10',
    jersey: '10',
    points: 3,
    fg3: 1,
    ms: 30_000,
    appeared: true,
  });

  await send(store, g.id, { type: 'undo' });
  const after = await db.query(
    'SELECT points FROM live_stats.player_game_lines WHERE game_id = $1 AND player_id = $2',
    [g.id, away[0].id],
  );
  assert.equal(after.rows[0].points, 0, 'undo rewrites the saved line');
});

test('actions are refused for players from the other team and for invalid plays', async () => {
  const { store } = await open();
  const g = (await store.schedule()).games[2];
  const mine = await store.addPlayer(g.home.id, { name: 'A', jersey: '1' });
  await assert.rejects(
    send(store, g.id, { type: 'score', side: 'away', playerId: mine.id, points: 2 }),
    (e) => e instanceof StoreError && e.status === 422,
  );
  await assert.rejects(
    send(store, g.id, { type: 'unfoul', side: 'home', playerId: mine.id }),
    TrackerError,
  );
  await assert.rejects(
    send(store, g.id, { type: 'score', side: 'home', playerId: mine.id, points: 4 }),
  );
  await assert.rejects(send(store, randomUUID(), { type: 'start' }), /Game not found/);
  assert.equal((await store.game(g.id)).revision, 0, 'refused actions save nothing');
});

test('final games count toward season stats and the record; removed players keep their lines', async () => {
  const { store } = await open();
  const g = (await store.schedule()).games[2]; // Al-Hadi at home
  const lion = await store.addPlayer(g.home.id, { name: 'Yusuf', jersey: '23' });
  const bench = await store.addPlayer(g.home.id, { name: 'Bench', jersey: '30' });
  const rival = await store.addPlayer(g.away.id, { name: '', jersey: '4' });
  await send(store, g.id, { type: 'lineup', side: 'home', playerIds: [lion.id] });
  await send(store, g.id, { type: 'lineup', side: 'away', playerIds: [rival.id] });
  await send(store, g.id, { type: 'score', side: 'home', playerId: lion.id, points: 2 });
  await send(store, g.id, { type: 'score', side: 'home', playerId: lion.id, points: 1 });
  await send(store, g.id, { type: 'foul', side: 'away', playerId: rival.id });
  let team = await store.team(g.home.id);
  assert.equal(
    team.stats.find((s) => s.playerId === lion.id).points,
    0,
    'live games do not count yet',
  );
  await send(store, g.id, { type: 'end' });
  team = await store.team(g.home.id);
  const line = team.stats.find((s) => s.playerId === lion.id);
  assert.deepEqual([line.gp, line.points, line.fg2, line.fg1], [1, 3, 1, 1]);
  assert.equal(team.stats.find((s) => s.playerId === bench.id).gp, 0, 'DNP is not a game played');
  assert.deepEqual(team.record, { wins: 1, losses: 0 });

  await store.removePlayer(lion.id);
  team = await store.team(g.home.id);
  assert.ok(!team.players.some((p) => p.id === lion.id));
  assert.equal(team.stats.find((s) => s.playerId === lion.id).points, 3);
  await store.updatePlayer(rival.id, { name: 'Their Center', jersey: '4' });
  assert.equal(
    (await store.game(g.id)).players.find((p) => p.id === rival.id).name,
    'Their Center',
  );

  // Reseeding never moves a game that has been played.
  await store.seed({ ...seed, games: seed.games.map((x) => ({ ...x, venue: 'Moved' })) });
  const games = (await store.schedule()).games;
  assert.equal(games.find((x) => x.id === g.id).venue, 'Al-Hadi Gym');
  assert.equal(games.find((x) => x.sourceRef === 'tcsaal:653').venue, 'Moved');
});
