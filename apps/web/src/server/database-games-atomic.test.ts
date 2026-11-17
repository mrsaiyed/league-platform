// A result and its standings move together or not at all (step 2.93 part 6; the area 5
// review, line 2 of the reviews' list), on the database ports' own wiring (databaseGamesDeps): with the standings
// store made to fail, a typed final score and a tracked game's End are each rolled back
// whole, and the same End tap is then taken once on working standings. And a correction
// keeps who made it, when and why.
import {
  applyTrackerCommands,
  openScoringSession,
  recordFinalScore,
  reopenGame,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gamesWorld, type GamesWorld } from './database-games.test-helper.ts';
import { databaseGamesDeps } from './database-games.ts';

let w: GamesWorld;

beforeAll(async () => {
  w = await gamesWorld({ byHand: 2, live: 1 });
}, 300_000);

afterAll(async () => {
  await w.close();
});

let tapNumber = 0;
const tap = (input: unknown) => {
  tapNumber += 1;
  return { commandId: randomUUID(), at: w.clock.at - 60_000 + tapNumber, input };
};

describe('a result and its standings, on the database ports', () => {
  it('rolls a typed score and a tracked End back whole when the standings cannot be written', async () => {
    // The same deps as the ports', with the standings' write failing.
    const broken = databaseGamesDeps(
      {
        ...database,
        standingsStore: (scope) => ({
          ...database.standingsStore(scope),
          replaceRows: async () => {
            throw new Error('standings down');
          },
        }),
      },
      w.db,
      { log: () => {}, clock: { now: () => w.clock.at } },
    );
    const gameId = w.take(w.byHand);
    const before = await w.everything(w.leagueId, [gameId]);
    await expect(
      recordFinalScore(
        w.asOwner,
        { gameId, version: await w.versionOf(gameId), homeScore: 50, awayScore: 40 },
        broken,
      ),
    ).rejects.toThrow('standings down');
    expect(await w.everything(w.leagueId, [gameId])).toEqual(before);
    expect(await w.gameOf(gameId)).toMatchObject({ status: 'scheduled', homeScore: null });

    // A tracked game: its End tap with the standings down.
    const live = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    const opened = await openScoringSession(
      scorer,
      { gameId: live, deviceId: 'tablet' },
      w.ports.tracker.deps,
    );
    if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
    const sessionId = opened.value.sessionId;
    const batch = (commands: readonly unknown[]) => ({
      gameId: live,
      protocolVersion: 1,
      sessionId,
      commands,
    });
    const started = await applyTrackerCommands(
      scorer,
      batch([
        tap({ type: 'lineup', side: 'home', playerIds: w.players.herons }),
        tap({ type: 'lineup', side: 'away', playerIds: w.players.otters }),
        tap({ type: 'start' }),
        tap({ type: 'score', side: 'home', playerId: w.players.herons[0], points: 2 }),
      ]),
      w.ports.tracker.deps,
    );
    expect(started).toMatchObject({ ok: true });
    const underWay = await w.everything(w.leagueId, [live]);
    const end = tap({ type: 'end' });
    await expect(applyTrackerCommands(scorer, batch([end]), broken)).rejects.toThrow(
      'standings down',
    );
    expect(await w.everything(w.leagueId, [live])).toEqual(underWay);
    expect(await w.gameOf(live)).toMatchObject({ status: 'live' });
    // The same End tap again, on working standings: taken once, and the game is final.
    const again = await applyTrackerCommands(scorer, batch([end]), w.ports.tracker.deps);
    expect(again.ok && again.value.results.map((r) => r.status)).toEqual(['accepted']);
    expect(await w.gameOf(live)).toMatchObject({ status: 'final', homeScore: 2, awayScore: 0 });
    const once = await applyTrackerCommands(scorer, batch([end]), w.ports.tracker.deps);
    expect(once.ok && once.value.results.map((r) => r.status)).toEqual(['duplicate']);
  });

  it('keeps a correction: the date shown, and who made it in the activity log', async () => {
    const gameId = w.take(w.byHand);
    await recordFinalScore(
      w.asOwner,
      { gameId, version: await w.versionOf(gameId), homeScore: 70, awayScore: 64 },
      w.ports.games.deps,
    );
    const admin = w.contextOf('admin');
    const reopened = await reopenGame(
      admin,
      { gameId, version: await w.versionOf(gameId), reason: 'Wrong way round' },
      w.ports.games.deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    const kept = await database.withTransaction(w.db, w.asOwner, async (scope) => ({
      on: await database.findGameCorrectedDate(scope, gameId),
      log: await database.activityLogStore(scope).list(20, undefined, { type: 'league' }),
    }));
    expect(kept.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(kept.log).toContainEqual(
      expect.objectContaining({
        action: 'games.reopen_game',
        actorAccountId: admin.accountId,
        targetId: gameId,
      }),
    );
  });
});
