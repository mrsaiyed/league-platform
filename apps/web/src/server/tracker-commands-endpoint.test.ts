import {
  buildVersionRefusal,
  CommandReply,
  LiveMessage,
  VersionRefusal,
} from '@srleagues/contracts';
import { findPrivateFields, privateValuesOf } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  bears,
  bearsBench,
  bearsNames,
  games,
  hawks,
  liveLeagueId,
  tap,
  trackerWorld,
  type League,
  type Person,
} from './tracker-endpoints.test-helper.ts';

const commandsOf = (game: string) => ['games', game, 'commands'];

async function openSession(world: ReturnType<typeof trackerWorld>, game: string) {
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

async function send(
  world: ReturnType<typeof trackerWorld>,
  body: unknown,
  { as = 'scorekeeper', league = 'live', game = games.hawksBears } = {} as {
    as?: Person;
    league?: League;
    game?: string;
  },
) {
  const context = await world.contextAs(as, league, commandsOf(game));
  return sendTrackerCommands(context, game, body, world.tracker, world.publishPlays);
}

const tipOff = () => [
  tap({ type: 'lineup', side: 'home', playerIds: hawks }),
  tap({ type: 'lineup', side: 'away', playerIds: bears }),
  tap({ type: 'start' }),
];

describe('POST …/games/{game}/commands', () => {
  it('saves a batch, answers each tap, and then publishes the play and the score', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const batch = [
      ...tipOff(),
      tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
    ];
    const outcome = await send(world, { protocolVersion: 1, sessionId, commands: batch });
    expect(outcome.answer.status).toBe(200);
    const reply = CommandReply.parse(outcome.answer.body);
    expect(reply.results.map((r) => r.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'accepted',
    ]);
    expect(reply.sequence).toBe(4);
    // Nothing goes out before the answer: the route publishes afterwards.
    expect(world.published).toEqual([]);
    await outcome.afterwards?.();
    const [game, score] = world.published;
    expect(game?.kind).toBe('game');
    expect(game?.leagueId).toBe(liveLeagueId);
    const message = LiveMessage.parse(game?.message);
    expect(message).toMatchObject({
      gameId: games.hawksBears,
      sequence: 4,
      status: 'live',
      score: { home: 2, away: 0 },
    });
    expect(score).toMatchObject({
      kind: 'score',
      message: { gameId: games.hawksBears, sequence: 4, score: { home: 2, away: 0 } },
    });
  });

  it("never publishes a staff-only team's player names", async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const plays = [
      tap({ type: 'score', side: 'away', playerId: bears[0], points: 3 }),
      tap({ type: 'foul', side: 'away', playerId: bears[1] }),
      tap({ type: 'sub', side: 'away', inId: bearsBench, outId: bears[2] }),
      tap({ type: 'turnover', side: 'away', playerId: bears[3] }),
      // A play of the open team, too: one channel carries it to everyone.
      tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
    ];
    const first = await send(world, { protocolVersion: 1, sessionId, commands: tipOff() });
    await first.afterwards?.();
    for (const play of plays) {
      const outcome = await send(world, { protocolVersion: 1, sessionId, commands: [play] });
      expect(CommandReply.parse(outcome.answer.body).results[0]?.status).toBe('accepted');
      await outcome.afterwards?.();
    }
    const messages = world.published.filter((p) => p.kind === 'game').map((p) => p.message);
    expect(messages.map((m) => m.sequence)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(messages.map((m) => m.latestPlay?.type)).toEqual([
      'other',
      'score',
      'foul',
      'sub',
      'turnover',
      'score',
    ]);
    const text = JSON.stringify(world.published);
    for (const name of bearsNames) expect(text).not.toContain(name);
    for (const id of [...bears, bearsBench]) expect(text).not.toContain(id);
    const privateValues = bearsNames.flatMap((first) =>
      privateValuesOf(
        { firstName: first, lastName: 'Bearsley', nameRequest: 'removed' },
        { shown: false, why: 'restricted' },
      ),
    );
    expect(findPrivateFields(world.published, { privateValues })).toEqual([]);
    for (const message of messages) {
      expect(message.latestPlay?.playerName ?? null).toBeNull();
      expect(message.latestPlay?.jersey ?? null).toBeNull();
    }
    expect(world.warnings).toEqual([]);
  });

  it("refuses league B's game asked for through league A's address", async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const body = { protocolVersion: 1, sessionId, commands: tipOff() };
    // The owner holds both leagues: the game is simply not in the other one.
    const owner = await send(world, body, { as: 'owner', league: 'other' });
    expect(owner.answer).toEqual({ status: 404, body: { error: 'not-found' } });
    // The scorekeeper holds nothing in the other league.
    const scorekeeper = await send(world, body, { league: 'other' });
    expect(scorekeeper.answer).toEqual({ status: 403, body: { error: 'not-allowed' } });
    expect(owner.afterwards).toBeNull();
    // Nothing was saved in the game's own league either.
    const ownLeague = await send(world, body);
    expect(CommandReply.parse(ownLeague.answer.body).sequence).toBe(3);
  });

  it('answers a retried batch "duplicate", and publishes nothing for it', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const body = { protocolVersion: 1, sessionId, commands: tipOff() };
    await (await send(world, body)).afterwards?.();
    const again = await send(world, body);
    const reply = CommandReply.parse(again.answer.body);
    expect(reply.results.every((r) => r.status === 'duplicate')).toBe(true);
    expect(again.afterwards).toBeNull();
  });

  it('turns away a visitor, someone who may not score, a bad body and an old protocol', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const body = { protocolVersion: 1, sessionId, commands: tipOff() };
    expect((await send(world, body, { as: 'visitor' })).answer).toEqual({
      status: 401,
      body: { error: 'signed-out' },
    });
    expect((await send(world, body, { as: 'coach' })).answer.status).toBe(403);
    expect((await send(world, undefined)).answer.status).toBe(400);
    expect((await send(world, [1, 2])).answer.status).toBe(400);
    const bad = await send(world, { protocolVersion: 1, sessionId, commands: [] });
    expect(bad.answer).toMatchObject({ status: 400, body: { error: 'invalid-input' } });
    const old = await send(world, { ...body, protocolVersion: 99 });
    expect(old.answer.status).toBe(400);
    expect(VersionRefusal.parse(old.answer.body)).toEqual(buildVersionRefusal());
    const notAGame = await send(world, body, { game: 'not-a-game' });
    expect(notAGame.answer.status).toBe(404);
  });

  it('takes the game from the address, whatever the body says', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const outcome = await send(world, {
      protocolVersion: 1,
      sessionId,
      gameId: games.lionsTigers,
      commands: tipOff(),
    });
    expect(CommandReply.parse(outcome.answer.body).results[0]?.status).toBe('accepted');
  });

  it('refuses the taps of a device whose session was taken over, game by game', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world, games.hawksBears);
    const ownerContext = await world.contextAs('owner', 'live', [
      'games',
      games.hawksBears,
      'session',
    ]);
    const shown = await scoringSessionRequest(
      ownerContext,
      games.hawksBears,
      { type: 'open', deviceId: 'laptop' },
      world.tracker,
    );
    const holder = shown.body as { status: string; holder: { since: number } };
    expect(holder.status).toBe('held-by-other');
    await scoringSessionRequest(
      ownerContext,
      games.hawksBears,
      {
        type: 'take-over',
        deviceId: 'laptop',
        confirmed: true,
        expectedHolderSince: holder.holder.since,
      },
      world.tracker,
    );
    const late = await send(world, { protocolVersion: 1, sessionId, commands: tipOff() });
    const reply = CommandReply.parse(late.answer.body);
    expect(late.answer.status).toBe(200);
    expect(reply.results.map((r) => r.status === 'refused' && r.reason.code)).toEqual([
      'session-not-held',
      'session-not-held',
      'session-not-held',
    ]);
    expect(late.afterwards).toBeNull();
  });
});
