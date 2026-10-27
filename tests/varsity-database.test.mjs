import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { VarsityStore } from '../packages/database/src/varsity/store.ts';

test('PostgreSQL persistence: atomic commands, isolation, aggregate rebuild and restart', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'league-varsity-test-'));
  let db = new PGlite(dir),
    now = 1000;
  const workspace = randomUUID(),
    otherWorkspace = randomUUID();
  let store = new VarsityStore(db, workspace, () => now);
  try {
    await store.initialize();
    const r = await store.saveRoster({
      expectedRevision: 0,
      players: Array.from({ length: 6 }, (_, i) => ({
        name: `Test player ${i + 1}`,
        jersey: String(i + 1),
      })),
    });
    const input = {
      commandId: randomUUID(),
      opponent: 'Test opponent',
      trackedSide: 'away',
      scheduledAt: null,
      venue: '',
      sourceUrl: '',
      rules: { periods: 4, periodSeconds: 480, overtimeSeconds: 240 },
      rulesConfirmed: true,
      opponents: Array.from({ length: 6 }, (_, i) => ({ jersey: String(i + 10), name: '' })),
    };
    let game = await store.create(input);
    const gameId = game.id;
    const send = async (command) => {
      game = await store.command(gameId, {
        commandId: randomUUID(),
        expectedRevision: game.revision,
        input: command,
      });
      return game;
    };
    await t.test(
      'creation is idempotent and frozen roster cannot be changed by a later edit',
      async () => {
        assert.equal((await store.create(input)).id, gameId);
        await assert.rejects(store.create({ ...input, opponent: 'Different input' }), /reused/);
        await store.saveRoster({
          expectedRevision: r.revision,
          players: r.players.map((p, i) => ({ ...p, name: i === 0 ? 'Renamed later' : p.name })),
        });
        assert.equal(
          (await store.game(gameId)).state.players[r.players[0].id].name,
          r.players[0].name,
        );
      },
    );
    for (const side of ['home', 'away'])
      await send({
        type: 'lineup',
        side,
        playerIds: Object.values(game.state.players)
          .filter((p) => p.side === side)
          .slice(0, 5)
          .map((p) => p.id),
      });
    await send({ type: 'start' });
    const player = r.players[0].id;
    const envelope = {
      commandId: randomUUID(),
      expectedRevision: game.revision,
      input: { type: 'score', playerId: player, points: 3 },
    };
    now += 30000;
    await t.test(
      'retry after an unknown response does not double count and mismatched replay is rejected',
      async () => {
        game = await store.command(gameId, envelope);
        game = await store.command(gameId, envelope);
        assert.equal(game.away.score, 3);
        await assert.rejects(
          store.command(gameId, {
            ...envelope,
            input: { type: 'score', playerId: player, points: 2 },
          }),
          /reused/,
        );
      },
    );
    await t.test('two stale simultaneous writers cannot both commit', async () => {
      const revision = game.revision;
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          store.command(gameId, {
            commandId: randomUUID(),
            expectedRevision: revision,
            input: { type: 'foul', playerId: player },
          }),
        ),
      );
      assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
      game = await store.game(gameId);
      assert.equal(game.state.players[player].fouls, 1);
    });
    await t.test(
      'rejected event rolls back event, current state and stat lines together',
      async () => {
        const revision = game.revision;
        await assert.rejects(send({ type: 'score', playerId: randomUUID(), points: 2 }), /not in/);
        assert.equal((await store.game(gameId)).revision, revision);
        const exported = await store.exportGame(gameId);
        assert.equal(exported.events.length, revision);
      },
    );
    now += 30000;
    await send({ type: 'pause' });
    await send({ type: 'finalize' });
    await t.test(
      'finalization populates SQL season stats; zero-point appearances count and DNP does not',
      async () => {
        const d = await store.dashboard();
        assert.equal(d.stats.length, 5);
        assert.equal(d.stats.find((p) => p.playerId === player).points, 3);
        assert.equal(d.stats.find((p) => p.playerId === player).gp, 1);
        assert.equal(d.stats.find((p) => p.playerId === player).milliseconds, 60000);
        assert.equal(d.stats.filter((p) => p.points === 0).length, 4);
      },
    );
    await t.test(
      'reopening withdraws totals; correcting and refinalizing replaces them without doubling',
      async () => {
        await send({ type: 'reopen', reason: 'Remove incorrect three pointer' });
        assert.equal((await store.dashboard()).stats.length, 0);
        const target = game.state.events.find((e) => e.input.type === 'score');
        await send({ type: 'undo', targetId: target.id });
        await send({ type: 'finalize' });
        const d = await store.dashboard();
        assert.equal(d.stats.find((p) => p.playerId === player).points, 0);
        assert.equal(d.stats.find((p) => p.playerId === player).gp, 1);
      },
    );
    await t.test('practice games never enter team season totals', async () => {
      let p = await store.create({ ...input, commandId: randomUUID() }, true);
      const psend = async (i) => {
        p = await store.command(p.id, {
          commandId: randomUUID(),
          expectedRevision: p.revision,
          input: i,
        });
      };
      for (const side of ['home', 'away'])
        await psend({
          type: 'lineup',
          side,
          playerIds: Object.values(p.state.players)
            .filter((x) => x.side === side)
            .slice(0, 5)
            .map((x) => x.id),
        });
      await psend({ type: 'start' });
      await psend({ type: 'pause' });
      await psend({ type: 'finalize' });
      assert.equal((await store.dashboard()).stats.length, 5);
    });
    await t.test(
      'another workspace cannot read or mutate a game or claim its roster IDs',
      async () => {
        const other = new VarsityStore(db, otherWorkspace);
        await other.initialize();
        await assert.rejects(other.game(gameId), /not found/);
        await assert.rejects(other.command(gameId, envelope), /not found/);
        await assert.rejects(
          other.saveRoster({ expectedRevision: 0, players: [r.players[0]] }),
          /identity/,
        );
        assert.equal((await other.dashboard()).games.length, 0);
      },
    );
    await t.test('records survive a database process close and reopen', async () => {
      await db.close();
      db = new PGlite(dir);
      store = new VarsityStore(db, workspace, () => now);
      await store.initialize();
      assert.equal((await store.game(gameId)).status, 'final');
      assert.equal((await store.dashboard()).stats.length, 5);
      assert.ok((await store.exportGame(gameId)).events.length > 5);
    });
  } finally {
    await db.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('league-varsity-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
