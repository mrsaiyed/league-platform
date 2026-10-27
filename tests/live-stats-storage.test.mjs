// The same behaviour, checked against every storage adapter. A new database (a
// Firestore adapter, say) is ready when it passes this file.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { LiveStats, StatsError } from '../apps/live-stats/service.ts';
import { MemoryRepository } from '../packages/database/src/live-stats/memory.ts';
import {
  PostgresRepository,
  connectPostgres,
} from '../packages/database/src/live-stats/postgres.ts';
import { TrackerError } from '../packages/sports/src/basketball/live.ts';

const seed = JSON.parse(
  await readFile(
    new URL('../apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json', import.meta.url),
  ),
);

const adapters = {
  'documents in memory': async () => ({ repo: new MemoryRepository(), done: async () => {} }),
  'embedded PostgreSQL': async () => {
    const repo = new PostgresRepository(new PGlite());
    return { repo, done: () => repo.close() };
  },
  // The way a hosted database such as Supabase is reached: the pg driver over the network.
  'PostgreSQL over the network': async () => {
    const db = new PGlite();
    const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
    await server.start();
    const repo = new PostgresRepository(
      await connectPostgres(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
        ssl: 'off',
        max: 1,
      }),
    );
    return {
      repo,
      done: async () => {
        await repo.close();
        await server.stop();
        await db.close();
      },
    };
  },
};

for (const [name, make] of Object.entries(adapters))
  describe(name, () => {
    async function open() {
      let now = Date.parse('2026-11-02T19:05:00-06:00');
      const { repo, done } = await make();
      await repo.initialize();
      const stats = new LiveStats(repo, () => now);
      await stats.seed(seed);
      return { stats, repo, done, tick: (ms) => (now += ms) };
    }
    const send = (stats, gameId, input, commandId = randomUUID()) =>
      stats.command(gameId, { commandId, input });
    const roster = (stats, teamId, jerseys, name = (j) => `Player ${j}`) =>
      Promise.all(
        jerseys.map((j) => stats.addPlayer(teamId, { name: name(j), jersey: String(j) })),
      );

    test('the TCSAAL schedule seeds once, in date order, with Al-Hadi tracked', async () => {
      const { stats, done } = await open();
      try {
        await stats.seed(seed);
        const { team, games } = await stats.schedule();
        assert.equal(team.name, 'Al-Hadi');
        assert.equal(games.length, 10);
        assert.equal(games[0].sourceRef, 'tcsaal:653');
        assert.equal(games[0].away.name, 'Al-Hadi');
        assert.equal(games[0].home.name, 'KIPP Academy West');
        assert.equal(games[0].startsAt, '2026-11-03T01:00:00.000Z');
        assert.equal(games[0].gameType, 'exhibition');
        assert.ok(games.every((g, i) => i === 0 || g.startsAt >= games[i - 1].startsAt));
        assert.equal((await stats.teams()).length, 6);
      } finally {
        await done();
      }
    });

    test('rosters take any number of players, by name, jersey or both', async () => {
      const { stats, done } = await open();
      try {
        const { team } = await stats.schedule();
        for (let i = 0; i < 40; i++)
          await stats.addPlayer(team.id, { name: `Player ${i}`, jersey: String(i % 100) });
        await stats.addPlayer(team.id, { name: '', jersey: '00' });
        await stats.addPlayer(team.id, { name: 'No Number', jersey: '' });
        await assert.rejects(
          stats.addPlayer(team.id, { name: '', jersey: '' }),
          /name or a jersey/,
        );
        await assert.rejects(stats.addPlayer(team.id, { name: 'X', jersey: '100' }), /0–99/);
        await assert.rejects(
          stats.addPlayer(randomUUID(), { name: 'X', jersey: '1' }),
          /Team not found/,
        );
        const { players } = await stats.team(team.id);
        assert.equal(players.length, 42);
        assert.deepEqual(
          players.slice(0, 3).map((p) => p.jersey),
          ['00', '0', '1'],
        );
        assert.equal(players.at(-1).name, 'No Number');
      } finally {
        await done();
      }
    });

    test('an action is saved once, with its score and lines, even when retried', async () => {
      const { stats, repo, done, tick } = await open();
      try {
        const g = (await stats.schedule()).games[0];
        const home = await roster(stats, g.home.id, [1, 2, 3, 4, 5]);
        const away = await roster(stats, g.away.id, [10, 11, 12, 13, 14], (j) => `Lion ${j}`);
        await send(stats, g.id, { type: 'lineup', side: 'home', playerIds: home.map((p) => p.id) });
        await send(stats, g.id, { type: 'lineup', side: 'away', playerIds: away.map((p) => p.id) });
        await send(stats, g.id, { type: 'start' });
        tick(30_000);
        const basket = { type: 'score', side: 'away', playerId: away[0].id, points: 3 };
        const id = randomUUID();
        const [a, b] = await Promise.all([
          send(stats, g.id, basket, id),
          send(stats, g.id, basket, id),
        ]);
        assert.deepEqual([a.changed, b.changed].sort(), [false, true], 'a retry is applied once');
        const game = await stats.game(g.id);
        assert.equal(game.awayScore, 3);
        assert.equal(game.status, 'live');
        assert.equal(game.revision, 4);

        await send(stats, g.id, { type: 'foul', side: 'home', playerId: home[0].id });
        await send(stats, g.id, { type: 'end' });
        const lines = await repo.finalLines(g.away.id);
        assert.deepEqual(
          lines.find((l) => l.playerId === away[0].id),
          {
            playerId: away[0].id,
            teamId: g.away.id,
            name: 'Lion 10',
            jersey: '10',
            appeared: true,
            points: 3,
            fg1: 0,
            fg2: 0,
            fg3: 1,
            fouls: 0,
            ms: 30_000,
          },
        );
        assert.equal(lines.length, 5);
        assert.equal((await repo.finalLines(g.home.id)).find((l) => l.fouls).fouls, 1);
      } finally {
        await done();
      }
    });

    test('undo rewrites the saved lines', async () => {
      const { stats, repo, done } = await open();
      try {
        const g = (await stats.schedule()).games[2];
        const [mine] = await roster(stats, g.home.id, [23]);
        const [theirs] = await roster(stats, g.away.id, [4]);
        await send(stats, g.id, { type: 'lineup', side: 'home', playerIds: [mine.id] });
        await send(stats, g.id, { type: 'score', side: 'home', playerId: mine.id, points: 2 });
        await send(stats, g.id, { type: 'undo' });
        await send(stats, g.id, { type: 'foul', side: 'away', playerId: theirs.id });
        await send(stats, g.id, { type: 'end' });
        const line = (await repo.finalLines(g.home.id)).find((l) => l.playerId === mine.id);
        assert.deepEqual([line.points, line.fg2, line.appeared], [0, 0, true]);
      } finally {
        await done();
      }
    });

    test('refused actions save nothing', async () => {
      const { stats, done } = await open();
      try {
        const g = (await stats.schedule()).games[2];
        const [mine] = await roster(stats, g.home.id, [1]);
        await assert.rejects(
          send(stats, g.id, { type: 'score', side: 'away', playerId: mine.id, points: 2 }),
          (e) => e instanceof StatsError && e.status === 422,
        );
        await assert.rejects(
          send(stats, g.id, { type: 'unfoul', side: 'home', playerId: mine.id }),
          TrackerError,
        );
        await assert.rejects(
          send(stats, g.id, { type: 'score', side: 'home', playerId: mine.id, points: 4 }),
        );
        await assert.rejects(send(stats, randomUUID(), { type: 'start' }), /Game not found/);
        assert.equal((await stats.game(g.id)).revision, 0);
      } finally {
        await done();
      }
    });

    test('season totals and the record come from final games', async () => {
      const { stats, done } = await open();
      try {
        const g = (await stats.schedule()).games[2]; // Al-Hadi at home
        const lion = await stats.addPlayer(g.home.id, { name: 'Yusuf', jersey: '23' });
        const bench = await stats.addPlayer(g.home.id, { name: 'Bench', jersey: '30' });
        const rival = await stats.addPlayer(g.away.id, { name: '', jersey: '4' });
        await send(stats, g.id, { type: 'lineup', side: 'home', playerIds: [lion.id] });
        await send(stats, g.id, { type: 'lineup', side: 'away', playerIds: [rival.id] });
        await send(stats, g.id, { type: 'score', side: 'home', playerId: lion.id, points: 2 });
        await send(stats, g.id, { type: 'score', side: 'home', playerId: lion.id, points: 1 });
        await send(stats, g.id, { type: 'foul', side: 'away', playerId: rival.id });
        let team = await stats.team(g.home.id);
        assert.equal(team.stats.find((s) => s.playerId === lion.id).points, 0, 'live games wait');
        await send(stats, g.id, { type: 'end' });
        team = await stats.team(g.home.id);
        const line = team.stats.find((s) => s.playerId === lion.id);
        assert.deepEqual([line.gp, line.points, line.fg2, line.fg1], [1, 3, 1, 1]);
        assert.equal(team.stats[0].playerId, lion.id, 'top scorer first');
        assert.equal(team.stats.find((s) => s.playerId === bench.id).gp, 0, 'DNP is no game');
        assert.deepEqual(team.record, { wins: 1, losses: 0 });
        assert.equal(team.games.length, 10);
        assert.equal((await stats.team(g.away.id)).games.length, 2, 'KIPP Connect plays twice');

        await stats.removePlayer(lion.id);
        team = await stats.team(g.home.id);
        assert.ok(!team.players.some((p) => p.id === lion.id));
        assert.equal(team.stats.find((s) => s.playerId === lion.id).points, 3);
        await stats.updatePlayer(rival.id, { name: 'Their Center', jersey: '4' });
        const players = (await stats.game(g.id)).players;
        assert.equal(players.find((p) => p.id === rival.id).name, 'Their Center');
        await assert.rejects(
          stats.updatePlayer(randomUUID(), { name: 'X', jersey: '' }),
          /not found/,
        );

        // Reseeding moves a game nobody has tracked, never one that was played.
        await stats.seed({ ...seed, games: seed.games.map((x) => ({ ...x, venue: 'Moved' })) });
        const games = (await stats.schedule()).games;
        assert.equal(games.find((x) => x.id === g.id).venue, 'Al-Hadi Gym');
        assert.equal(games.find((x) => x.sourceRef === 'tcsaal:653').venue, 'Moved');
      } finally {
        await done();
      }
    });
  });

test('PostgreSQL keeps every action and the live box score in its own tables', async () => {
  const db = new PGlite();
  const repo = new PostgresRepository(db);
  await repo.initialize();
  const stats = new LiveStats(repo);
  await stats.seed(seed);
  const g = (await stats.schedule()).games[0];
  const [p] = await Promise.all([stats.addPlayer(g.away.id, { name: 'A', jersey: '1' })]);
  await send(stats, g.id, { type: 'lineup', side: 'away', playerIds: [p.id] });
  await send(stats, g.id, { type: 'score', side: 'away', playerId: p.id, points: 2 });
  const events = await db.query(
    'SELECT sequence, command FROM live_stats.game_events WHERE game_id = $1 ORDER BY sequence',
    [g.id],
  );
  assert.deepEqual(
    events.rows.map((e) => [e.sequence, e.command.input.type]),
    [
      [1, 'lineup'],
      [2, 'score'],
    ],
  );
  const lines = await db.query(
    'SELECT points FROM live_stats.player_game_lines WHERE game_id = $1',
    [g.id],
  );
  assert.deepEqual(lines.rows, [{ points: 2 }]);
  await repo.close();

  function send(s, gameId, input) {
    return s.command(gameId, { commandId: randomUUID(), input });
  }
});
