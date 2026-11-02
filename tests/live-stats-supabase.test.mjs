// Ready for Supabase: the tables stay closed to Supabase's public API roles, bad
// connection strings say how to fix them, and games tracked on this computer copy up
// to a hosted database whole, without doubling anything, as often as it is run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { LiveStats } from '../apps/live-stats/service.ts';
import {
  PostgresRepository,
  connectPostgres,
  describeDatabaseError,
  parseDatabaseUrl,
} from '../packages/database/src/live-stats/postgres.ts';
import { copyLiveStats } from '../packages/database/src/live-stats/copy.ts';

const seed = JSON.parse(
  await readFile(
    new URL('../apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json', import.meta.url),
  ),
);
const send = (stats, gameId, input) => stats.command(gameId, { commandId: randomUUID(), input });

test("Supabase's public API roles can reach nothing; the owner the server uses is unaffected", async () => {
  const db = new PGlite();
  try {
    // As on Supabase: API roles exist, and the server's role owns the tables without being a superuser.
    await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE app NOLOGIN; GRANT CREATE ON DATABASE postgres TO app; SET ROLE app;`);
    const repo = new PostgresRepository(db);
    await repo.initialize();
    const stats = new LiveStats(repo);
    await stats.seed(seed);
    const g = (await stats.schedule()).games[0];
    const p = await stats.addPlayer(g.home.id, { name: 'A', jersey: '1' });
    await send(stats, g.id, { type: 'lineup', side: 'home', playerIds: [p.id] });
    await send(stats, g.id, { type: 'score', side: 'home', playerId: p.id, points: 2 });
    assert.equal(
      (await stats.game(g.id)).homeScore,
      2,
      'row-level security does not limit the owner',
    );

    // Exposed by mistake: starting the server again takes the access back.
    await db.exec(`GRANT USAGE ON SCHEMA live_stats TO anon;
      GRANT SELECT ON ALL TABLES IN SCHEMA live_stats TO anon, authenticated;`);
    await repo.initialize();
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM live_stats.games'), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE app');

    // And with access granted outright, row-level security still shows them no rows.
    await db.exec(`GRANT USAGE ON SCHEMA live_stats TO authenticated;
      GRANT SELECT ON live_stats.games, live_stats.players TO authenticated; SET ROLE authenticated;`);
    assert.equal((await db.query('SELECT * FROM live_stats.games')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM live_stats.players')).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('connection strings: a usable one passes; a broken one says how to fix it', () => {
  const ok = parseDatabaseUrl(
    'postgresql://postgres.abcdefghijklmnopqrst:s3cretPass@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
  );
  assert.equal(ok.hostname, 'aws-0-us-east-1.pooler.supabase.com');
  assert.equal(parseDatabaseUrl('postgres://u:p%23ss@localhost/db').password, 'p%23ss');
  for (const [bad, why] of [
    ['postgresql://postgres.ref:[YOUR-PASSWORD]@host:5432/postgres', /placeholder/],
    ['postgresql://postgres.ref:pa#ss@host:5432/postgres', /percent-encode/],
    ['postgresql://postgres.ref:pass@host:5432/postgres#x', /unencoded symbol/],
    ['postgresql://postgres.ref:pa/ss@host:5432/postgres', /not a valid|unencoded/],
    ['https://example.supabase.co', /postgresql:\/\//],
    ['not a url', /not a valid/],
  ])
    assert.throws(() => parseDatabaseUrl(bad), why, bad);

  assert.match(describeDatabaseError({ code: '28P01', message: 'x' }), /password .* is wrong/);
  assert.match(describeDatabaseError({ code: 'ENOTFOUND', message: 'x' }), /address/);
  assert.match(describeDatabaseError({ code: 'ENETUNREACH', message: 'x' }), /Session pooler/);
  assert.match(
    describeDatabaseError(new Error('Tenant or user not found')),
    /postgres\.<project-ref>/,
  );
  assert.match(
    describeDatabaseError(new Error('Connection terminated due to connection timeout')),
    /pauses/,
  );
});

/** A database reached over the network through `pg`, the way Supabase is. */
async function hosted() {
  const raw = new PGlite();
  const server = new PGLiteSocketServer({ db: raw, port: 0, host: '127.0.0.1' });
  await server.start();
  const db = await connectPostgres(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    {
      ssl: 'off',
      max: 1,
    },
  );
  const repo = new PostgresRepository(db);
  await repo.initialize();
  return {
    db,
    stats: new LiveStats(repo),
    done: async () => {
      await db.close();
      await server.stop();
      await raw.close();
    },
  };
}

test('games tracked on this computer copy up to a hosted database, whole and only once', async () => {
  // This computer: a roster, one final game, and one still being played.
  const localDb = new PGlite();
  const localRepo = new PostgresRepository(localDb);
  await localRepo.initialize();
  const local = new LiveStats(localRepo);
  await local.seed(seed);
  const games = (await local.schedule()).games;
  const [final, live, both] = [games[2], games[4], games[6]];
  const lions = final.home.id;
  const yusuf = await local.addPlayer(lions, { name: 'Yusuf', jersey: '23' });
  const omar = await local.addPlayer(lions, { name: 'Omar', jersey: '5' });
  const rival = await local.addPlayer(final.away.id, { name: '', jersey: '4' });
  await send(local, final.id, { type: 'lineup', side: 'home', playerIds: [yusuf.id] });
  await send(local, final.id, { type: 'lineup', side: 'away', playerIds: [rival.id] });
  await send(local, final.id, { type: 'start' });
  await send(local, final.id, { type: 'score', side: 'home', playerId: yusuf.id, points: 3 });
  await send(local, final.id, { type: 'sub', side: 'home', inId: omar.id, outId: yusuf.id });
  await send(local, final.id, { type: 'score', side: 'home', playerId: omar.id, points: 2 });
  await send(local, final.id, { type: 'foul', side: 'away', playerId: rival.id });
  await send(local, final.id, { type: 'turnover', side: 'home', playerId: omar.id });
  await send(local, final.id, { type: 'end' });
  const liveSide = live.home.tracked ? 'home' : 'away';
  await send(local, live.id, { type: 'lineup', side: liveSide, playerIds: [yusuf.id] });
  await send(local, live.id, { type: 'score', side: liveSide, playerId: yusuf.id, points: 2 });

  // Supabase, set up separately: the server seeded it (its own ids) and Omar was entered there too.
  const cloud = await hosted();
  try {
    await cloud.stats.seed(seed);
    const cloudOmar = await cloud.stats.addPlayer((await cloud.stats.schedule()).team.id, {
      name: 'omar ',
      jersey: '5',
    });

    const preview = await copyLiveStats(localDb, cloud.db, { apply: false });
    assert.deepEqual(preview.teams, { add: 0, same: 6 }, 'teams matched by slug');
    assert.deepEqual(
      preview.players,
      { add: 2, update: 0, same: 1 },
      'Omar matched by number and name',
    );
    assert.deepEqual(
      preview.games.map((g) => g.action),
      ['add', 'add'],
    );
    assert.equal(
      (await cloud.stats.schedule()).games.filter((g) => g.revision).length,
      0,
      'a preview writes nothing',
    );

    const done = await copyLiveStats(localDb, cloud.db, { apply: true });
    assert.equal(done.applied, true);
    const there = (await cloud.stats.schedule()).games.find((g) => g.sourceRef === final.sourceRef);
    assert.notEqual(there.id, final.id, 'the hosted game keeps its own id');
    const [a, b] = [await local.game(final.id), await cloud.stats.game(there.id)];
    assert.deepEqual(
      [b.status, b.homeScore, b.awayScore, b.revision],
      [a.status, a.homeScore, a.awayScore, a.revision],
    );
    assert.equal(b.state.plays.length, a.state.plays.length);
    // Omar's plays now name the Omar who was already there.
    const sub = b.state.plays.find((p) => p.type === 'sub');
    assert.equal(sub.inId, cloudOmar.id);
    const events = await cloud.db.query(
      'SELECT count(*)::int AS n FROM live_stats.game_events WHERE game_id = $1',
      [there.id],
    );
    assert.equal(events.rows[0].n, a.revision, 'every recorded action came across');
    // The season totals and game logs read the same on both sides.
    const [mine, theirs] = [await local.team(lions), await cloud.stats.team(cloudOmar.teamId)];
    assert.deepEqual(
      theirs.stats.filter((s) => s.gp).map((s) => [s.jersey, s.gp, s.points, s.ms]),
      mine.stats.filter((s) => s.gp).map((s) => [s.jersey, s.gp, s.points, s.ms]),
    );
    assert.deepEqual(theirs.record, { wins: 1, losses: 0 });
    assert.deepEqual(
      theirs.gameLog.map((g) => [g.result, g.score, g.opponentScore, g.top.name]),
      [['W', 5, 0, 'Yusuf']],
    );
    const omarThere = (await cloud.stats.playerLog(cloudOmar.id)).totals;
    assert.deepEqual([omarThere.points, omarThere.turnovers], [2, 1], 'turnovers came across');

    // Again: nothing new. Then the live game carries on here, and the copy catches up.
    const again = await copyLiveStats(localDb, cloud.db, { apply: false });
    assert.deepEqual(
      again.games.map((g) => g.action),
      ['same', 'same'],
    );
    assert.deepEqual(again.players, { add: 0, update: 0, same: 3 });
    await send(local, live.id, { type: 'score', side: liveSide, playerId: yusuf.id, points: 3 });
    await local.updatePlayer(yusuf.id, { name: 'Yusuf Ali', jersey: '23' });
    const caught = await copyLiveStats(localDb, cloud.db, { apply: true });
    assert.deepEqual(
      caught.games.map((g) => g.action),
      ['same', 'update'],
    );
    assert.equal(caught.players.update, 1, 'the newer name wins');
    const liveThere = (await cloud.stats.schedule()).games.find(
      (g) => g.sourceRef === live.sourceRef,
    );
    assert.equal(liveSide === 'home' ? liveThere.homeScore : liveThere.awayScore, 5);
    assert.equal(
      (await cloud.stats.game(liveThere.id)).players.find((p) => p.id === yusuf.id).name,
      'Yusuf Ali',
    );

    // Scoring carries on there: the hosted game is ahead now, so the copy leaves it.
    await send(cloud.stats, liveThere.id, {
      type: 'score',
      side: liveSide,
      playerId: yusuf.id,
      points: 1,
    });
    assert.deepEqual(
      (await copyLiveStats(localDb, cloud.db, { apply: false })).games.map((g) => g.action),
      ['same', 'newer-there'],
    );

    // Tracked separately on both sides: a conflict, left alone unless replacing.
    const bothThere = (await cloud.stats.schedule()).games.find(
      (g) => g.sourceRef === both.sourceRef,
    );
    const side = both.home.tracked ? 'home' : 'away';
    await send(local, both.id, { type: 'lineup', side, playerIds: [omar.id] });
    await send(cloud.stats, bothThere.id, { type: 'lineup', side, playerIds: [cloudOmar.id] });
    await send(cloud.stats, bothThere.id, { type: 'start' });
    const conflict = await copyLiveStats(localDb, cloud.db, { apply: true });
    assert.equal(conflict.games.find((g) => g.id === both.id).action, 'conflict');
    assert.equal((await cloud.stats.game(bothThere.id)).revision, 2, 'left as it was');
    const replaced = await copyLiveStats(localDb, cloud.db, { apply: true, replace: true });
    assert.equal(replaced.games.find((g) => g.id === both.id).action, 'replace');
    assert.equal((await cloud.stats.game(bothThere.id)).revision, 1);
  } finally {
    await cloud.done();
    await localDb.close();
  }
});

test('a hosted database copies down to a fresh folder as a backup', async () => {
  const cloud = await hosted();
  const backup = new PGlite();
  try {
    await cloud.stats.seed(seed);
    const g = (await cloud.stats.schedule()).games[0];
    const p = await cloud.stats.addPlayer(g.away.id, { name: 'A', jersey: '1' });
    await send(cloud.stats, g.id, { type: 'lineup', side: 'away', playerIds: [p.id] });
    await send(cloud.stats, g.id, { type: 'score', side: 'away', playerId: p.id, points: 2 });
    await new PostgresRepository(backup).initialize();
    const report = await copyLiveStats(cloud.db, backup, { apply: true });
    assert.deepEqual([report.teams.add, report.players.add, report.games.length], [6, 1, 1]);
    const restored = new LiveStats(new PostgresRepository(backup));
    const copy = await restored.game(g.id);
    assert.deepEqual([copy.awayScore, copy.revision, copy.players.length], [2, 2, 1]);
    // The server seeding the backup later adds the untracked fixtures and leaves the copy alone.
    await restored.seed(seed);
    assert.equal((await restored.schedule()).games.length, 10);
    assert.equal((await restored.game(g.id)).awayScore, 2);
  } finally {
    await cloud.done();
    await backup.close();
  }
});
