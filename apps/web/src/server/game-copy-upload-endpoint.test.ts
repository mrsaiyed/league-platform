import {
  BatchCommand,
  CommandReply,
  GameCopyUploadReply,
  maxGameCopyLength,
  writeGameCopy,
} from '@srleagues/contracts';
import { readTrackerState, type CommandLogLine } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { commandContextOf } from './context.ts';
import { uploadGameCopy } from './game-copy-upload-endpoint.ts';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  bears,
  games,
  hawks,
  liveLeagueId,
  tap,
  trackerWorld,
  type Person,
} from './tracker-endpoints.test-helper.ts';

type World = ReturnType<typeof trackerWorld>;

/** The tablet opens the game and holds it. */
async function tabletOpens(world: World, game: string = games.hawksBears) {
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'session']);
  const answer = await scoringSessionRequest(
    context,
    game,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  const body = answer.body as { status: string; sessionId?: string };
  if (body.sessionId === undefined) throw new Error(`not opened: ${body.status}`);
  return body.sessionId;
}

/** The tablet sends its queue, late or not, under its own session. */
async function tabletSends(world: World, sessionId: string, commands: readonly unknown[]) {
  const game = games.hawksBears;
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']);
  const outcome = await sendTrackerCommands(
    context,
    game,
    { protocolVersion: 2, sessionId, commands },
    world.tracker,
    world.publishPlays,
  );
  return CommandReply.parse(outcome.answer.body);
}

async function upload(
  world: World,
  body: unknown,
  { as = 'scorekeeper', game = games.hawksBears }: { as?: Person; game?: string } = {},
) {
  const context = await world.contextAs(as, 'live', ['games', game, 'copy']);
  const outcome = await uploadGameCopy(context, game, body, world.tracker, world.publishPlays);
  return { status: outcome.answer.status, reply: outcome.answer.body, outcome };
}

/** Uploads the copy, answering the takeover question with yes when it is asked. */
async function uploadTakingOver(world: World, copy: string) {
  const first = await upload(world, { copy });
  const reply = GameCopyUploadReply.parse(first.reply);
  if (reply.status !== 'held-by-other') return first;
  return upload(world, { copy, takeOver: { expectedHolderSince: reply.holder.since } });
}

async function sequenceOf(world: World, game: string = games.hawksBears) {
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'state']);
  const read = await readTrackerState(
    commandContextOf(context),
    { gameId: game },
    world.tracker.deps,
  );
  if (!read.ok) throw new Error(read.error.code);
  return read.value.sequence;
}

const theGame = () => [
  tap({ type: 'lineup', side: 'home', playerIds: hawks }),
  tap({ type: 'lineup', side: 'away', playerIds: bears }),
  tap({ type: 'start' }),
  tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
];

const copyOf = (commands: readonly ReturnType<typeof tap>[], game: string = games.hawksBears) =>
  writeGameCopy({
    leagueId: liveLeagueId,
    gameId: game,
    savedAt: Date.now(),
    commands: commands.map((command) => ({
      protocolVersion: 2,
      command: BatchCommand.parse(command),
    })),
  });

describe('POST …/games/{game}/copy: a copy uploaded from another device (step 2.70)', () => {
  it('the copy first, the tablet late: one result, the late taps answered duplicate', async () => {
    const world = trackerWorld();
    const session = await tabletOpens(world);
    const plays = theGame();
    const sent = await uploadTakingOver(world, copyOf(plays));
    expect(sent.reply).toEqual({ status: 'uploaded', added: 4, alreadyThere: 0, notTaken: 0 });
    expect(await sequenceOf(world)).toBe(4);
    const late = await tabletSends(world, session, plays);
    expect(late.results.map((r) => r.status)).toEqual([
      'duplicate',
      'duplicate',
      'duplicate',
      'duplicate',
    ]);
    expect(await sequenceOf(world)).toBe(4);
  });

  it('a release that fails after the plays were saved still answers the counts and tells the watchers (T-371)', async () => {
    const world = trackerWorld();
    const tablet = await tabletOpens(world);
    const real = world.tracker.deps.transaction;
    // Ending any session but the tablet's (the takeover ends that one) fails: the release.
    const transaction: typeof real = (context, work) =>
      real(context, (tx) =>
        work({
          ...tx,
          scoringSessions: {
            ...tx.scoringSessions,
            end: async (game, session) => {
              if (session !== tablet) throw new Error('the release failed');
              return tx.scoringSessions.end(game, session);
            },
          },
        }),
      );
    const lines: CommandLogLine[] = [];
    const log = (line: CommandLogLine) => void lines.push(line);
    const tracker = { ...world.tracker, deps: { ...world.tracker.deps, transaction, log } };
    const copy = copyOf(theGame());
    const ask = async (body: unknown) => {
      const context = await world.contextAs('scorekeeper', 'live', [
        'games',
        games.hawksBears,
        'copy',
      ]);
      return uploadGameCopy(context, games.hawksBears, body, tracker, world.publishPlays);
    };
    const first = GameCopyUploadReply.parse((await ask({ copy })).answer.body);
    if (first.status !== 'held-by-other') throw new Error(first.status);
    const outcome = await ask({ copy, takeOver: { expectedHolderSince: first.holder.since } });
    expect(outcome.answer).toEqual({
      status: 200,
      body: { status: 'uploaded', added: 4, alreadyThere: 0, notTaken: 0 },
    });
    expect(outcome.afterwards).not.toBeNull();
    expect(await sequenceOf(world)).toBe(4);
    expect(lines).toContainEqual(expect.objectContaining({ errorCode: 'release-failed' }));
  });

  it('the tablet first, the copy late: nothing added, and the tablet keeps the game', async () => {
    const world = trackerWorld();
    const session = await tabletOpens(world);
    const plays = theGame();
    await tabletSends(world, session, plays);
    const sent = await upload(world, { copy: copyOf(plays) });
    expect(sent.reply).toEqual({ status: 'uploaded', added: 0, alreadyThere: 4, notTaken: 0 });
    expect(await sequenceOf(world)).toBe(4);
    const next = await tabletSends(world, session, [
      tap({ type: 'score', side: 'away', playerId: bears[0], points: 3 }),
    ]);
    expect(next.results.map((r) => r.status)).toEqual(['accepted']);
    expect(await sequenceOf(world)).toBe(5);
  });

  it('half sent by the tablet, the copy, then the rest late: each play counted once', async () => {
    const world = trackerWorld();
    const session = await tabletOpens(world);
    const plays = theGame();
    await tabletSends(world, session, plays.slice(0, 2));
    const sent = await uploadTakingOver(world, copyOf(plays));
    expect(sent.reply).toEqual({ status: 'uploaded', added: 2, alreadyThere: 2, notTaken: 0 });
    const late = await tabletSends(world, session, plays.slice(2));
    expect(late.results.map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
    expect(await sequenceOf(world)).toBe(4);
  });

  it('asks the takeover question before it takes a game another device holds', async () => {
    const world = trackerWorld();
    await tabletOpens(world);
    const asked = await upload(world, { copy: copyOf(theGame()) });
    expect(asked.status).toBe(200);
    expect(GameCopyUploadReply.parse(asked.reply).status).toBe('held-by-other');
    expect(await sequenceOf(world)).toBe(0);
  });

  it('changes nothing the second time the same copy is uploaded', async () => {
    const world = trackerWorld();
    const copy = copyOf(theGame());
    const first = await upload(world, { copy });
    expect(first.reply).toEqual({ status: 'uploaded', added: 4, alreadyThere: 0, notTaken: 0 });
    expect(first.outcome.afterwards).not.toBeNull();
    const again = await upload(world, { copy });
    expect(again.reply).toEqual({ status: 'uploaded', added: 0, alreadyThere: 4, notTaken: 0 });
    expect(again.outcome.afterwards).toBeNull();
    expect(await sequenceOf(world)).toBe(4);
    // The upload let the game go: the tablet opens it without a takeover.
    await tabletOpens(world);
  });

  it('refuses a person who may not score the game, and a visitor', async () => {
    const world = trackerWorld();
    const copy = copyOf(theGame());
    for (const as of ['coach', 'stranger'] as const) {
      const sent = await upload(world, { copy }, { as });
      expect(sent.status).toBe(403);
      expect(sent.reply).toEqual({ status: 'refused', code: 'not-allowed' });
    }
    expect((await upload(world, { copy }, { as: 'visitor' })).status).toBe(401);
    expect(await sequenceOf(world)).toBe(0);
  });

  it('refuses a final game: reopen it first', async () => {
    const world = trackerWorld();
    const sent = await upload(
      world,
      { copy: copyOf(theGame(), games.decided) },
      { game: games.decided },
    );
    expect(sent.status).toBe(409);
    expect(sent.reply).toEqual({ status: 'refused', code: 'reopen-first' });
  });

  it('refuses a copy of another game, a damaged file, and a body that is no upload', async () => {
    const world = trackerWorld();
    const huge = await upload(world, { copy: 'x'.repeat(maxGameCopyLength + 1) });
    expect([huge.status, huge.reply]).toEqual([413, { error: 'too-large' }]);
    const other = await upload(world, { copy: copyOf(theGame(), games.lionsTigers) });
    expect(other.status).toBe(422);
    expect(other.reply).toEqual({ status: 'refused', code: 'other-game' });
    const cut = copyOf(theGame()).slice(0, 80);
    expect((await upload(world, { copy: cut })).reply).toEqual({
      status: 'refused',
      code: 'damaged',
    });
    expect((await upload(world, { copy: 42, sessionId: 'x' })).status).toBe(400);
    expect(await sequenceOf(world)).toBe(0);
  });
});
