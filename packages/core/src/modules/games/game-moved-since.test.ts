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

/** One play the phone's scorekeeper records while holding the game, under `commandId`. */
const phonePlay = (t: Tracker, phoneSession: string, commandId: string) =>
  applyTrackerCommands(
    t.as(otherScorekeeperId),
    {
      gameId,
      protocolVersion: 2,
      sessionId: phoneSession,
      commands: [
        {
          commandId,
          at: t.clock.now(),
          input: { type: 'score', side: 'home', playerId: homeIds[1] ?? '', points: 3 },
        },
      ],
    },
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

  // The fix round (step 2.148): the server decides where the plays can have been made.
  it('the worst night: the phone records while the tablet is still offline; the tablet’s waiting batch is answered first, so its device knows the later sequence; sending is refused and the score stays', async () => {
    const { t, since, plays, phoneSession } = await takenOver();
    expect(statuses(await phonePlay(t, phoneSession, playUuid(97)))).toEqual(['accepted']);
    // The tablet's waiting batch is answered "not held", with the game's sequence now.
    const answered = await applyTrackerCommands(
      t.as(scorekeeperId),
      { gameId, protocolVersion: 2, sessionId, commands: plays.slice(0, 3) },
      t.deps,
    );
    const told = answered.ok ? answered.value.sequence : -1;
    expect(told).toBe(since + 1);
    const score = t.db.state.games.find((g) => g.id === gameId)?.homeScore;
    // Named with that sequence, as the device took it before this fix, or honestly.
    expect(statuses(await send(t, plays, told))).toEqual(plays.map(() => 'game-moved'));
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'game-moved'));
    expect(t.db.state.events).toHaveLength(since + 1);
    expect(t.db.state.games.find((g) => g.id === gameId)?.homeScore).toBe(score);
  });

  it('refuses a sequence before the one the server last answered the tablet with, and one after it', async () => {
    const { t, since, plays, phoneSession } = await takenOver();
    // Lower: the tablet's own saved basket lies after it, and is not one of these plays.
    expect(statuses(await send(t, plays, since - 1))).toEqual(plays.map(() => 'game-moved'));
    // Higher: the phone's play is the game's last event, so nothing lies after it.
    expect(statuses(await phonePlay(t, phoneSession, playUuid(97)))).toEqual(['accepted']);
    expect(statuses(await send(t, plays, since + 1))).toEqual(plays.map(() => 'game-moved'));
    expect(t.db.state.events).toHaveLength(since + 1);
  });

  it('refuses a scorekeeper who never held the game, even naming the holder’s own session', async () => {
    const t = setUp({ started: 1 });
    await tap(t, [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: awayIds },
      { type: 'start' },
    ]);
    const since = sequenceOf(t);
    const plays = twentyPlays(t);
    // The tablet still holds the game: the phone's scorekeeper sends past it.
    expect(statuses(await send(t, plays, since, otherScorekeeperId))).toEqual(
      plays.map(() => 'game-moved'),
    );
    expect(t.db.state.events).toHaveLength(since);
  });

  // The closing (step 2.148): the kept session's account is checked, not only the game.
  it('refuses another scorekeeper, allowed to score, who names the tablet’s lost session with nothing recorded since, and writes nothing', async () => {
    const { t, since, plays } = await takenOver();
    const logged = t.db.state.activity.length;
    // The phone's scorekeeper holds the game and learned the tablet's session id.
    expect(statuses(await send(t, plays, since, otherScorekeeperId))).toEqual(
      plays.map(() => 'game-moved'),
    );
    expect(t.db.state.events).toHaveLength(since);
    expect(t.db.state.activity).toHaveLength(logged);
    // The tablet's own scorekeeper can still send them: nothing was written for that session.
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'accepted'));
  });

  // T-370 (step 2.70, fix round): a copy uploaded by another account (the owner) records
  // the tablet's own commands under the owner's account. An event whose command id is one
  // of the batch's is the device's own, whoever recorded it.
  it('looks past the tablet’s own plays recorded by another account (a copy uploaded), and takes the rest once', async () => {
    const { t, since, plays, phoneSession } = await takenOver();
    const copied = plays.slice(0, 10);
    const upload = await applyTrackerCommands(
      t.as(otherScorekeeperId),
      { gameId, protocolVersion: 2, sessionId: phoneSession, commands: copied },
      t.deps,
    );
    expect(statuses(upload)).toEqual(copied.map(() => 'accepted'));
    expect(statuses(await send(t, plays, since))).toEqual([
      ...copied.map(() => 'duplicate'),
      ...plays.slice(10).map(() => 'accepted'),
    ]);
    const after = t.db.state.events.filter((e) => e.seq > since);
    expect(after.map((e) => e.commandId)).toEqual(plays.map((c) => c.commandId));
  });

  // The attacker (T-370): a device allowed to score names another's play as its own. It
  // stays once, as it was recorded; the claimed copy answers duplicate and adds nothing.
  it('a device claiming another’s play as its own counts nothing twice and drops nothing of theirs', async () => {
    const { t, since, plays, phoneSession } = await takenOver();
    const theirs = plays[0]?.commandId ?? '';
    expect(statuses(await phonePlay(t, phoneSession, theirs))).toEqual(['accepted']);
    const recorded = t.db.state.events.find((e) => e.commandId === theirs);
    expect(statuses(await send(t, plays, since))).toEqual([
      'duplicate',
      ...plays.slice(1).map(() => 'accepted'),
    ]);
    const after = t.db.state.events.filter((e) => e.seq > since);
    expect(after).toHaveLength(20);
    expect(after.filter((e) => e.commandId === theirs)).toEqual([recorded]);
    expect(recorded?.accountId).toBe(otherScorekeeperId);
    // A play of theirs the batch does not name still means the game moved.
    expect(statuses(await phonePlay(t, phoneSession, playUuid(98)))).toEqual(['accepted']);
    const more = [...plays, { ...(plays[1] as TrackerCommand), commandId: playUuid(97) }];
    expect(statuses(await send(t, more, since)).at(-1)).toBe('game-moved');
  });

  it('takes a long list in several batches, one answer lost and the batch sent again, each play once', async () => {
    const { t, since, plays } = await takenOver();
    const [first, second] = [plays.slice(0, 10), plays.slice(10)];
    // The first batch is taken, but its answer never reaches the tablet: sent again.
    expect(statuses(await send(t, first, since))).toEqual(first.map(() => 'accepted'));
    expect(statuses(await send(t, first, since))).toEqual(first.map(() => 'duplicate'));
    // The second names the same sequence: the first batch's plays are not "moved".
    expect(statuses(await send(t, second, since))).toEqual(second.map(() => 'accepted'));
    expect(statuses(await send(t, plays, since))).toEqual(plays.map(() => 'duplicate'));
    const after = t.db.state.events.filter((e) => e.seq > since);
    expect(after.map((e) => e.commandId)).toEqual(plays.map((c) => c.commandId));
  });

  it('writes the send in the activity log as plays sent after a takeover', async () => {
    const { t, since, plays } = await takenOver();
    await send(t, plays, since);
    expect(t.db.state.activity.at(-1)).toMatchObject({
      action: 'games.apply_tracker_commands',
      actorAccountId: scorekeeperId,
      details: { gameId, change: 'sent-after-takeover', events: 20 },
    });
  });

  // T-372: a whole game's copy uploaded is longer than one batch of the list. The device
  // sends its plays in the order made, fifty at a time, all naming the same sequence.
  const baskets = (t: Tracker, n: number): TrackerCommand[] =>
    Array.from({ length: n }, (_, i) => ({
      commandId: playUuid(i + 1),
      at: t.clock.now() + i * 1000,
      input: { type: 'score', side: 'home', playerId: homeIds[i % 5] ?? '', points: 2 },
    }));
  const inBatches = async (commands: TrackerCommand[], each: (b: TrackerCommand[]) => unknown) => {
    const answers: unknown[] = [];
    for (let i = 0; i < commands.length; i += 50)
      answers.push(await each(commands.slice(i, i + 50)));
    return answers;
  };
  const upload = (t: Tracker, phoneSession: string, commands: TrackerCommand[]) =>
    inBatches(commands, async (batch) =>
      statuses(
        await applyTrackerCommands(
          t.as(otherScorekeeperId),
          { gameId, protocolVersion: 2, sessionId: phoneSession, commands: batch },
          t.deps,
        ),
      ),
    );

  it('takes the 5 new plays of 120 once, 115 of them already uploaded, batch by batch', async () => {
    const { t, since, phoneSession } = await takenOver();
    const plays = baskets(t, 120);
    expect((await upload(t, phoneSession, plays.slice(0, 115))).flat()).toEqual(
      plays.slice(0, 115).map(() => 'accepted'),
    );
    expect(await inBatches(plays, async (batch) => statuses(await send(t, batch, since)))).toEqual([
      plays.slice(0, 50).map(() => 'duplicate'),
      plays.slice(50, 100).map(() => 'duplicate'),
      [...plays.slice(100, 115).map(() => 'duplicate'), ...plays.slice(115).map(() => 'accepted')],
    ]);
    const after = t.db.state.events.filter((e) => e.seq > since);
    expect(after.map((e) => e.commandId)).toEqual(plays.map((c) => c.commandId));
  });

  it('refuses the 5 new plays of 120 when somebody else recorded one in the middle of the upload', async () => {
    const { t, since, phoneSession } = await takenOver();
    const plays = baskets(t, 120);
    await upload(t, phoneSession, plays.slice(0, 60));
    expect(statuses(await phonePlay(t, phoneSession, playUuid(900)))).toEqual(['accepted']);
    await upload(t, phoneSession, plays.slice(60, 115));
    expect(await inBatches(plays, async (batch) => statuses(await send(t, batch, since)))).toEqual([
      plays.slice(0, 50).map(() => 'duplicate'),
      plays.slice(50, 100).map(() => 'duplicate'),
      [
        ...plays.slice(100, 115).map(() => 'duplicate'),
        ...plays.slice(115).map(() => 'game-moved'),
      ],
    ]);
    const after = t.db.state.events.filter((e) => e.seq > since);
    expect(after).toHaveLength(116);
    const ids = new Set(after.map((e) => e.commandId));
    expect(plays.slice(115).filter((c) => ids.has(c.commandId))).toEqual([]);
    expect(after.filter((e) => e.commandId === playUuid(900))).toHaveLength(1);
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
