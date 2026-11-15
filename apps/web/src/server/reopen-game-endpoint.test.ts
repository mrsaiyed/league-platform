// The scorekeeper's reopening through its endpoint, on the web app's made-up stand-in
// (step 2.120, S-36): End game tapped too soon on the tablet, reopened with a reason,
// and the same tablet opens the game again and carries on; past the league's minutes
// the answer is a refusal whose words say an admin can reopen it. The server's clock is
// the stand-in's own (Date.now), moved here with fake dates.
import { CommandReply, SessionReply } from '@srleagues/contracts';
import { en } from '@srleagues/site';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reopenRefusalStatus, reopenTrackedGameRequest } from './reopen-game-endpoint.ts';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  bears,
  games,
  hawks,
  tap,
  trackerWorld,
  type League,
  type Person,
} from './tracker-endpoints.test-helper.ts';

type World = ReturnType<typeof trackerWorld>;
const game = games.hawksBears;
const minutes = (n: number) => n * 60_000;
const reason = 'Tapped End game instead of Pause';

afterEach(() => void vi.useRealTimers());

async function openSession(world: World) {
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'session']);
  const answer = await scoringSessionRequest(
    context,
    game,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  return SessionReply.parse(answer.body);
}

async function send(world: World, sessionId: string, inputs: readonly unknown[]) {
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']);
  const outcome = await sendTrackerCommands(
    context,
    game,
    { protocolVersion: 1, sessionId, commands: inputs.map((input) => tap(input)) },
    world.tracker,
    world.publishPlays,
  );
  return CommandReply.parse(outcome.answer.body);
}

async function reopen(
  world: World,
  body: unknown,
  { as = 'scorekeeper', league = 'live', at = game } = {} as {
    as?: Person;
    league?: League;
    at?: string;
  },
) {
  const context = await world.contextAs(as, league, ['games', at, 'reopen']);
  return reopenTrackedGameRequest(context, at, body, world.tracker, world.publishPlays);
}

/** The game scored and ended on the tablet; its session and the number of the end. */
async function endedOnTablet(world: World) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 11, 13, 18, 0, 0));
  const opened = await openSession(world);
  if (opened.status !== 'held-by-you') throw new Error(`not opened: ${opened.status}`);
  await send(world, opened.sessionId, [
    { type: 'lineup', side: 'home', playerIds: hawks },
    { type: 'lineup', side: 'away', playerIds: bears },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: hawks[0], points: 2 },
  ]);
  const ended = await send(world, opened.sessionId, [{ type: 'end' }]);
  expect(ended.results[0]?.status).toBe('accepted');
  return { sessionId: opened.sessionId, sequence: ended.sequence, endedAt: Date.now() };
}

describe('POST …/games/{game}/reopen', () => {
  it('reopens at 29 minutes; the tablet opens the game again and carries on', async () => {
    const world = trackerWorld();
    const { sessionId, sequence, endedAt } = await endedOnTablet(world);
    vi.setSystemTime(endedAt + minutes(29));
    const outcome = await reopen(world, { sequence, reason });
    expect(outcome.answer).toEqual({
      status: 200,
      body: { status: 'reopened', sequence: sequence + 1, sentAt: endedAt + minutes(29) },
    });
    // The people watching see it live again, once the answer has gone.
    expect(world.published).toEqual([]);
    await outcome.afterwards?.();
    expect(world.published.find((p) => p.kind === 'game')?.message).toMatchObject({
      gameId: game,
      status: 'live',
    });
    const again = await openSession(world);
    expect(again).toMatchObject({ status: 'held-by-you', sessionId });
    const carried = await send(world, sessionId, [
      { type: 'score', side: 'away', playerId: bears[0], points: 3 },
      { type: 'end' },
    ]);
    expect(carried.results.map((r) => r.status)).toEqual(['accepted', 'accepted']);
    expect(carried.sequence).toBe(sequence + 3);
  });

  it('is refused at 31 minutes, in words that say an admin can reopen it', async () => {
    const world = trackerWorld();
    const { sequence, endedAt } = await endedOnTablet(world);
    vi.setSystemTime(endedAt + minutes(31));
    const outcome = await reopen(world, { sequence, reason });
    expect(outcome.answer).toEqual({
      status: 403,
      body: { status: 'refused', code: 'reopen-time-over', sentAt: endedAt + minutes(31) },
    });
    expect(outcome.afterwards).toBeNull();
    expect(en['error.games.reopen_tracked_game.reopen-time-over']).toContain(
      'A league admin can reopen it.',
    );
    // The owner may correct games, so still may.
    expect((await reopen(world, { sequence, reason }, { as: 'owner' })).answer.status).toBe(200);
  });

  it('needs a reason and the number of the end the device knows', async () => {
    const world = trackerWorld();
    const { sequence } = await endedOnTablet(world);
    for (const missing of [{ sequence }, { sequence, reason: '  ' }]) {
      expect((await reopen(world, missing)).answer).toMatchObject({
        status: 400,
        body: { status: 'refused', code: 'reason-needed' },
      });
    }
    expect((await reopen(world, { reason })).answer).toMatchObject({
      status: 400,
      body: { error: 'invalid-input' },
    });
    expect((await reopen(world, undefined)).answer.status).toBe(400);
    expect((await reopen(world, { sequence: sequence - 1, reason })).answer).toMatchObject({
      status: 409,
      body: { code: 'changed-since-read' },
    });
  });

  it("turns away a visitor, someone who may not score, and league B's game through A's address", async () => {
    const world = trackerWorld();
    const { sequence } = await endedOnTablet(world);
    const body = { sequence, reason };
    expect((await reopen(world, body, { as: 'visitor' })).answer).toEqual({
      status: 401,
      body: { error: 'signed-out' },
    });
    expect((await reopen(world, body, { as: 'coach' })).answer).toMatchObject({
      status: 403,
      body: { code: 'not-allowed' },
    });
    // The owner holds both leagues: the game is simply not in the other one.
    expect((await reopen(world, body, { as: 'owner', league: 'other' })).answer).toMatchObject({
      status: 404,
      body: { code: 'game-not-found' },
    });
    expect((await reopen(world, body, { league: 'other' })).answer).toMatchObject({
      status: 403,
      body: { code: 'not-allowed' },
    });
    expect((await reopen(world, body, { at: 'not-a-game' })).answer.status).toBe(404);
    // Still final in its own league.
    expect((await reopen(world, body)).answer.status).toBe(200);
  });

  it('answers a game whose score was entered by hand: not ended from the tracker', async () => {
    const world = trackerWorld();
    const outcome = await reopen(world, { sequence: 1, reason }, { at: games.decided });
    expect(outcome.answer).toMatchObject({ status: 409, body: { code: 'not-ended-by-tracker' } });
  });

  it('has words in the message files for every refusal it answers', () => {
    for (const code of Object.keys(reopenRefusalStatus)) {
      const key = `error.games.reopen_tracked_game.${code}`;
      expect(Object.hasOwn(en, key), key).toBe(true);
    }
  });
});
