// "Send these plays" (S-43, T-335), at the commands door: plays listed as not saved
// after a takeover are taken only while the server's game has not moved since they were
// made, once each however often they are sent, and refused `game-moved` otherwise.
import type { TrackerCommand } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { applyTrackerCommands } from './commands/apply-tracker-commands.ts';
import { takeOverScoring } from './commands/take-over-scoring.ts';
import { editorId, scorekeeperId } from './memory-games.test-helper.ts';
import { startOfTest } from './memory-scoring.test-helper.ts';
import {
  awayIds,
  gameId,
  homeIds,
  otherScorekeeperId,
  reopenAs,
  sequenceOf,
  sessionId,
  setUp,
  tap,
  type Tracker,
} from './reopen-game.test-helper.ts';

type Input = TrackerCommand['input'];
const playUuid = (n: number) => `01900000-0000-7000-8000-0000d0${String(n).padStart(6, '0')}`;

/** Twenty plays the tablet made with no signal, a second apart. */
const twentyPlays = (t: Tracker): TrackerCommand[] =>
  Array.from({ length: 20 }, (_, i) => ({
    commandId: playUuid(i + 1),
    at: t.clock.now() + i * 1000,
    input: (i % 2 === 0
      ? { type: 'score', side: 'home', playerId: homeIds[i % 5] ?? '', points: 2 }
      : { type: 'foul', side: 'away', playerId: awayIds[i % 5] ?? '' }) satisfies Input,
  }));

const statuses = (result: Awaited<ReturnType<typeof applyTrackerCommands>>) =>
  result.ok
    ? result.value.results.map((r) => (r.status === 'refused' ? r.reason.code : r.status))
    : result.error.code;

const send = (t: Tracker, commands: TrackerCommand[], since: number, accountId = scorekeeperId) =>
  applyTrackerCommands(
    t.as(accountId),
    { gameId, protocolVersion: 2, sessionId, notSavedSince: since, commands },
    t.deps,
  );

/** Tip-off and a basket saved from the tablet; then `who` takes the game over on a phone. */
async function takenOver(who = otherScorekeeperId) {
  // The tablet's session is the first started: a new one is told apart from it.
  const t = setUp({ started: 1 });
  await tap(t, [
    { type: 'lineup', side: 'home', playerIds: homeIds },
    { type: 'lineup', side: 'away', playerIds: awayIds },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
  ]);
  const since = sequenceOf(t);
  t.clock.advance(600);
  const taken = await takeOverScoring(
    t.as(who),
    { gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
    t.deps,
  );
  const phoneSession =
    taken.ok && taken.value.status === 'held-by-you' ? taken.value.sessionId : '';
  expect(phoneSession).not.toBe('');
  const plays = twentyPlays(t);
  // The tablet's plays are refused: it no longer holds the game, so they are not saved.
  const late = await applyTrackerCommands(
    t.as(scorekeeperId),
    { gameId, protocolVersion: 2, sessionId, commands: plays },
    t.deps,
  );
  expect(new Set(statuses(late))).toEqual(new Set(['session-not-held']));
  return { t, since, plays, phoneSession };
}

describe('send these plays (S-43, T-335)', () => {
  it('with nothing recorded in between, puts all twenty on the server once, in order; a second send adds none', async () => {
    const { t, since, plays } = await takenOver();
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'accepted'));
    const after = t.db.state.events.filter((e) => e.seq > since);
    expect(after.map((e) => e.commandId)).toEqual(plays.map((c) => c.commandId));
    expect(after.map((e) => e.accountId)).toEqual(plays.map(() => scorekeeperId));
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'duplicate'));
    expect(t.db.state.events).toHaveLength(since + 20);
  });

  it('with one play recorded in between, refuses every play, so each is entered again', async () => {
    const { t, since, plays, phoneSession } = await takenOver();
    const between = await applyTrackerCommands(
      t.as(otherScorekeeperId),
      {
        gameId,
        protocolVersion: 2,
        sessionId: phoneSession,
        commands: [
          {
            commandId: playUuid(99),
            at: t.clock.now(),
            input: { type: 'foul', side: 'home', playerId: homeIds[1] ?? '' },
          },
        ],
      },
      t.deps,
    );
    expect(statuses(between)).toEqual(['accepted']);
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'game-moved'));
    expect(t.db.state.events).toHaveLength(since + 1);
  });

  it('counts the plays the server took before its answer was lost once only, and takes the rest', async () => {
    // The tablet's session is the first started: a new one is told apart from it.
    const t = setUp({ started: 1 });
    await tap(t, [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: awayIds },
      { type: 'start' },
    ]);
    const since = sequenceOf(t);
    const plays = twentyPlays(t);
    // Five were taken, but the tablet never heard back; then it was taken over.
    await applyTrackerCommands(
      t.as(scorekeeperId),
      { gameId, protocolVersion: 2, sessionId, commands: plays.slice(0, 5) },
      t.deps,
    );
    t.clock.advance(600);
    await takeOverScoring(
      t.as(otherScorekeeperId),
      { gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
      t.deps,
    );
    expect(statuses(await send(t, plays, since))).toEqual([
      ...plays.slice(0, 5).map(() => 'duplicate'),
      ...plays.slice(5).map(() => 'accepted'),
    ]);
    expect(t.db.state.events).toHaveLength(since + 20);
  });

  it('an End and a reopen by the same scorekeeper do not count as something recorded in between', async () => {
    // The scorekeeper moved to their phone, ended the game there and reopened it.
    const { t, since, plays, phoneSession } = await takenOver(scorekeeperId);
    const ended = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        gameId,
        protocolVersion: 2,
        sessionId: phoneSession,
        commands: [{ commandId: playUuid(98), at: t.clock.now(), input: { type: 'end' } }],
      },
      t.deps,
    );
    expect(statuses(ended)).toEqual(['accepted']);
    expect(await reopenAs(t, scorekeeperId)).toBe('ok');
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'accepted'));
    expect(t.db.state.events).toHaveLength(since + 22);
  });

  it('an End by another scorekeeper does count', async () => {
    const { t, since, plays, phoneSession } = await takenOver();
    await applyTrackerCommands(
      t.as(otherScorekeeperId),
      {
        gameId,
        protocolVersion: 2,
        sessionId: phoneSession,
        commands: [{ commandId: playUuid(98), at: t.clock.now(), input: { type: 'end' } }],
      },
      t.deps,
    );
    expect(await reopenAs(t, otherScorekeeperId)).toBe('ok');
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'game-moved'));
  });

  it('refuses a sequence the game never reached, plays said to be another account’s, and whoever may not score', async () => {
    const { t, since, plays } = await takenOver();
    expect(statuses(await send(t, plays, since + 50))).toEqual(plays.map(() => 'game-moved'));
    const otherMaker = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        gameId,
        protocolVersion: 2,
        sessionId,
        accountId: otherScorekeeperId,
        notSavedSince: since,
        commands: plays,
      },
      t.deps,
    );
    expect(statuses(otherMaker)).toEqual(plays.map(() => 'session-not-held'));
    expect(await send(t, plays, since, editorId)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(t.db.state.events).toHaveLength(since);
  });

  it('a version 1 batch cannot ask for it', async () => {
    const { t, since, plays } = await takenOver();
    const v1 = await applyTrackerCommands(
      t.as(scorekeeperId),
      { gameId, protocolVersion: 1, sessionId, notSavedSince: since, commands: plays },
      t.deps,
    );
    expect(v1).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
});
