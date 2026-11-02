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
import { SupabaseRepository } from '../packages/database/src/live-stats/supabase.ts';
import { fakeSupabase } from './support/fake-supabase.mjs';

const seed = JSON.parse(
  await readFile(
    new URL('../apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json', import.meta.url),
  ),
);

const adapters = {
  // The static site on GitHub Pages: the browser calls Supabase's REST API, as a signed-in scorer.
  'Supabase from the browser': async () => {
    const supabase = await fakeSupabase();
    let token = null;
    const repo = new SupabaseRepository({
      url: supabase.url,
      key: supabase.key,
      token: () => token,
    });
    ({ token } = await repo.rpc('ls_sign_in', { p_passcode: supabase.passcode }));
    return { repo, done: () => supabase.stop() };
  },
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
            gameId: g.id,
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
            turnovers: 0,
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

    test('game logs: one line per final game for the team and each player, as played', async () => {
      const { stats, done, tick } = await open();
      try {
        const games = (await stats.schedule()).games;
        const home = games[2]; // Al-Hadi at home
        const away = games.find((g, i) => i > 2 && g.away.tracked); // later, on the road
        const lions = home.home.id;
        const yusuf = await stats.addPlayer(lions, { name: 'Yusuf', jersey: '23' });
        const omar = await stats.addPlayer(lions, { name: 'Omar', jersey: '5' });
        const play = async (g, side, other, points) => {
          const rival = await stats.addPlayer(g[other].id, { name: '', jersey: '4' });
          await send(stats, g.id, { type: 'lineup', side, playerIds: [yusuf.id] });
          await send(stats, g.id, { type: 'lineup', side: other, playerIds: [rival.id] });
          await send(stats, g.id, { type: 'start' });
          tick(60_000);
          await send(stats, g.id, { type: 'score', side, playerId: yusuf.id, points });
          await send(stats, g.id, { type: 'score', side: other, playerId: rival.id, points: 2 });
          await send(stats, g.id, { type: 'foul', side, playerId: yusuf.id });
          await send(stats, g.id, { type: 'turnover', side, playerId: yusuf.id });
          await send(stats, g.id, { type: 'turnover', side: other, playerId: rival.id });
          await send(stats, g.id, { type: 'end' });
          return rival;
        };
        const rival = await play(home, 'home', 'away', 3);
        await play(away, 'away', 'home', 1);

        const team = await stats.team(lions);
        assert.deepEqual(
          team.gameLog.map((g) => [g.gameId, g.result, g.score, g.opponentScore, g.home]),
          [
            [home.id, 'W', 3, 2, true],
            [away.id, 'L', 1, 2, false],
          ],
        );
        assert.deepEqual(
          [
            team.gameLog[0].fg3,
            team.gameLog[0].fouls,
            team.gameLog[0].turnovers,
            team.gameLog[0].played,
          ],
          [1, 1, 1, 1],
        );
        assert.equal(team.stats.find((x) => x.playerId === yusuf.id).turnovers, 2, 'season total');
        assert.deepEqual(team.gameLog[0].top, {
          playerId: yusuf.id,
          name: 'Yusuf',
          jersey: '23',
          points: 3,
        });
        assert.equal(team.gameLog[1].opponent.id, away.home.id);

        // Renumbered after the games: the log keeps the number worn in them.
        await stats.updatePlayer(yusuf.id, { name: 'Yusuf', jersey: '10' });
        const log = await stats.playerLog(yusuf.id);
        assert.equal(log.player.jersey, '10');
        assert.deepEqual(
          log.games.map((g) => [
            g.gameId,
            g.played,
            g.jersey,
            g.points,
            g.fg3,
            g.fg1,
            g.fouls,
            g.turnovers,
            g.ms,
          ]),
          [
            [home.id, true, '23', 3, 1, 0, 1, 1, 60_000],
            [away.id, true, '23', 1, 0, 1, 1, 1, 60_000],
          ],
        );
        assert.deepEqual(log.totals, {
          gp: 2,
          points: 4,
          fg1: 1,
          fg2: 0,
          fg3: 1,
          fouls: 2,
          turnovers: 2,
          ms: 120_000,
        });
        const benched = await stats.playerLog(omar.id);
        assert.deepEqual(
          benched.games.map((g) => g.played),
          [false, false],
          'DNP in both',
        );
        assert.equal(benched.totals.gp, 0);
        await assert.rejects(stats.playerLog(randomUUID()), /Player not found/);

        // A final game carries its saved lines, names and numbers as they were.
        const final = await stats.game(home.id);
        assert.equal(final.lines.find((l) => l.playerId === yusuf.id).jersey, '23');
        assert.equal(final.lines.find((l) => l.playerId === rival.id).points, 2);
        assert.deepEqual((await stats.game(games[5].id)).lines, [], 'none before a game is final');
      } finally {
        await done();
      }
    });
  });

test('a database made before turnovers were kept gains them on the next start', async () => {
  const db = new PGlite();
  const repo = new PostgresRepository(db);
  await repo.initialize();
  const stats = new LiveStats(repo);
  await stats.seed(seed);
  const g = (await stats.schedule()).games[0];
  const p = await stats.addPlayer(g.away.id, { name: 'A', jersey: '1' });
  await stats.command(g.id, {
    commandId: randomUUID(),
    input: { type: 'lineup', side: 'away', playerIds: [p.id] },
  });
  // As it was before: no turnovers column, and a line already saved.
  await db.exec('ALTER TABLE live_stats.player_game_lines DROP COLUMN turnovers');
  assert.equal((await db.query('SELECT * FROM live_stats.player_game_lines')).rows.length, 1);
  await repo.initialize();
  assert.deepEqual(
    (await db.query('SELECT turnovers FROM live_stats.player_game_lines')).rows,
    [{ turnovers: 0 }],
    'earlier lines count none',
  );
  await stats.command(g.id, {
    commandId: randomUUID(),
    input: { type: 'turnover', side: 'away', playerId: p.id },
  });
  assert.deepEqual((await db.query('SELECT turnovers FROM live_stats.player_game_lines')).rows, [
    { turnovers: 1 },
  ]);
  await repo.close();
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
