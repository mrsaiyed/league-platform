import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { HostedStore } from '../apps/varsity-hosted/lib/store.ts';

// Exercise the actual hosted SQL statements against SQLite, including atomic batch rollback.
class D1TestAdapter {
  constructor() {
    this.sql = new DatabaseSync(':memory:');
  }
  prepare(sql) {
    const db = this.sql;
    const statement = (values = []) => ({
      bind(...args) {
        return statement(args);
      },
      async first() {
        return db.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...values) };
      },
      async run() {
        const result = db.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    });
    return statement();
  }
  async batch(statements) {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const values = [];
      for (const s of statements) values.push(await s.run());
      this.sql.exec('COMMIT');
      return values;
    } catch (error) {
      this.sql.exec('ROLLBACK');
      throw error;
    }
  }
}
test('hosted SQL persists each play and rolls back failed projections', async () => {
  const db = new D1TestAdapter();
  db.sql.exec(
    await readFile(
      new URL('../apps/varsity-hosted/drizzle/0000_useful_princess_powerful.sql', import.meta.url),
      'utf8',
    ),
  );
  const store = new HostedStore(db, 'test-operator', () => 1000000);
  await store.initialize();
  const saved = await store.saveRoster({
    expectedRevision: 0,
    players: Array.from({ length: 6 }, (_, i) => ({
      name: `Test ${i + 1}`,
      jersey: String(i + 1),
    })),
  });
  assert.equal(saved.revision, 1);
  await assert.rejects(() => store.saveRoster({ expectedRevision: 0, players: [] }), /changed/);
  const creation = {
    commandId: randomUUID(),
    opponent: 'Test opponent',
    trackedSide: 'home',
    scheduledAt: null,
    venue: '',
    sourceUrl: '',
    rules: { periods: 4, periodSeconds: 480, overtimeSeconds: 240 },
    rulesConfirmed: true,
    opponents: Array.from({ length: 6 }, (_, i) => ({ jersey: String(i + 11), name: '' })),
  };
  let game = await store.create(creation);
  assert.equal((await store.create(creation)).id, game.id);
  const command = async (input) => {
    game = await store.command(game.id, {
      commandId: randomUUID(),
      expectedRevision: game.revision,
      input,
    });
    return game;
  };
  const home = Object.values(game.state.players).filter((p) => p.side === 'home'),
    away = Object.values(game.state.players).filter((p) => p.side === 'away');
  await command({ type: 'lineup', side: 'home', playerIds: home.slice(0, 5).map((p) => p.id) });
  await command({ type: 'lineup', side: 'away', playerIds: away.slice(0, 5).map((p) => p.id) });
  await command({ type: 'start' });
  const action = {
    commandId: randomUUID(),
    expectedRevision: game.revision,
    input: { type: 'score', playerId: home[0].id, points: 3 },
  };
  game = await store.command(game.id, action);
  await store.command(game.id, action);
  assert.equal((await store.game(game.id)).home.score, 3);
  assert.equal(
    db.sql.prepare('SELECT points FROM varsity_lines WHERE player_id=?').get(home[0].id).points,
    3,
  );
  await assert.rejects(
    () => store.command(game.id, { ...action, input: { ...action.input, points: 2 } }),
    /reused/,
  );
  const before = game.revision;
  db.sql.exec(
    "CREATE TRIGGER fail_projection BEFORE INSERT ON varsity_lines BEGIN SELECT RAISE(ABORT,'projection failed'); END",
  );
  await assert.rejects(
    () => command({ type: 'score', playerId: home[0].id, points: 2 }),
    /projection failed/,
  );
  assert.equal((await store.game(game.id)).revision, before);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM varsity_events').get().n, before);
  db.sql.exec('DROP TRIGGER fail_projection');
  await command({ type: 'pause' });
  await command({ type: 'finalize' });
  let dashboard = await store.dashboard();
  assert.equal(dashboard.stats.length, 5);
  assert.equal(
    dashboard.stats.reduce((n, p) => n + p.points, 0),
    3,
  );
  assert.equal((await store.exportGame(game.id)).events.at(-1).actor, 'test-operator');
  await command({ type: 'reopen', reason: 'Review score correction' });
  assert.equal((await store.dashboard()).stats.length, 0);
  await command({ type: 'finalize' });
  assert.equal((await store.dashboard()).stats[0].points, 3);
  db.sql.close();
});
