// POST …/games/{game}/not-started (step 2.121, S-40) over the web app's made-up
// stand-in: both sides of S-40's line with their refusals, the live message and the
// snapshot saying scheduled at once, another device's taps refused afterwards, the
// tracker's own refusals for a visitor and a bad body, and one league's game never
// reached through another's address; and the words for each refusal and reason.
import {
  CommandReply,
  GameSnapshot,
  LiveMessage,
  NotStartedReply,
  notStartedReasons,
  notStartedRefusals,
} from '@srleagues/contracts';
import { en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { gameSnapshot } from './game-snapshot-endpoint.ts';
import { markNotStartedRequest } from './not-started-endpoint.ts';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  bears,
  games,
  hawks,
  liveLeagueId,
  tap,
  trackerWorld,
  type League,
  type Person,
} from './tracker-endpoints.test-helper.ts';

type World = ReturnType<typeof trackerWorld>;
const game = games.hawksBears;

async function session(world: World, body: unknown, as: Person = 'scorekeeper') {
  const context = await world.contextAs(as, 'live', ['games', game, 'session']);
  return scoringSessionRequest(context, game, body, world.tracker);
}

async function openSession(world: World) {
  const answer = await session(world, { type: 'open', deviceId: 'tablet-1' });
  const body = answer.body as { sessionId?: string };
  if (body.sessionId === undefined) throw new Error('not opened');
  return body.sessionId;
}

async function send(world: World, sessionId: string, commands: unknown[]) {
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']);
  const outcome = await sendTrackerCommands(
    context,
    game,
    { protocolVersion: 1, sessionId, commands },
    world.tracker,
    world.publishPlays,
  );
  await outcome.afterwards?.();
  return CommandReply.parse(outcome.answer.body);
}

async function mark(
  world: World,
  body: unknown,
  { as = 'scorekeeper', league = 'live', id = game } = {} as {
    as?: Person;
    league?: League;
    id?: string;
  },
) {
  const context = await world.contextAs(as, league, ['games', id, 'not-started']);
  return markNotStartedRequest(context, id, body, world.tracker, world.publishPlays);
}

async function snapshotOf(world: World) {
  const context = await world.contextAs('visitor', 'live', ['games', game, 'snapshot']);
  const answer = await gameSnapshot(
    { context, holder: undefined, carriesSignIn: false },
    game,
    world.tracker,
  );
  return GameSnapshot.parse(answer.body);
}

const tipOff = () => [
  tap({ type: 'lineup', side: 'home', playerIds: hawks }),
  tap({ type: 'lineup', side: 'away', playerIds: bears }),
  tap({ type: 'start' }),
];

describe('POST …/games/{game}/not-started', () => {
  it('puts a game with only clock taps back to scheduled and tells the people watching at once', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world);
    await send(world, sessionId, tipOff());
    expect(await snapshotOf(world)).toMatchObject({ status: 'live', sequence: 3 });
    const before = world.published.length;

    const outcome = await mark(world, { sequence: 3 });
    expect(outcome.answer.status).toBe(200);
    expect(NotStartedReply.parse(outcome.answer.body)).toMatchObject({
      status: 'not-started',
      sequence: 4,
    });
    // Published after the answer, as a batch of taps is.
    expect(world.published).toHaveLength(before);
    await outcome.afterwards?.();
    const [message, score] = world.published.slice(before);
    expect(message?.leagueId).toBe(liveLeagueId);
    expect(LiveMessage.parse(message?.message)).toMatchObject({
      gameId: game,
      sequence: 4,
      status: 'scheduled',
      score: { home: 0, away: 0 },
      latestPlay: null,
    });
    expect(score).toMatchObject({ kind: 'score', message: { gameId: game, sequence: 4 } });
    expect(await snapshotOf(world)).toMatchObject({
      status: 'scheduled',
      sequence: 4,
      score: { home: 0, away: 0 },
      players: [],
    });
  });

  it('refuses the tablet’s taps sent after it, as the server’s own refusal', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world);
    await send(world, sessionId, tipOff());
    // Marked from the scorekeeper's other device while the tablet still holds the game.
    expect((await mark(world, { sequence: 3 })).answer.status).toBe(200);
    const reply = await send(world, sessionId, [
      tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
    ]);
    expect(reply.results).toMatchObject([
      { status: 'refused', reason: { code: 'session-not-held' } },
    ]);
    expect(reply.sequence).toBe(4);
    // The tablet's session is gone: opening the game again starts a new one.
    const renewed = await session(world, { type: 'renew', sessionId });
    expect(renewed.body).toMatchObject({ status: 'ended' });
    const again = await openSession(world);
    expect(again).not.toBe(sessionId);
    const restarted = await send(world, again, tipOff());
    expect(restarted.results.map((r) => r.status)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(await snapshotOf(world)).toMatchObject({ status: 'live', sequence: 7 });
  });

  it('once a basket is recorded, refuses the scorekeeper and takes the owner with a reason', async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world);
    await send(world, sessionId, [
      ...tipOff(),
      tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
    ]);
    const refused = await mark(world, { sequence: 4, reason: 'wrongGame' });
    expect(refused.answer.status).toBe(403);
    expect(NotStartedReply.parse(refused.answer.body)).toMatchObject({
      status: 'refused',
      code: 'not-allowed',
    });
    expect(refused.afterwards).toBeNull();

    // The owner is on another device: refused while the tablet holds the game.
    const held = await mark(world, { sequence: 4, reason: 'wrongGame' }, { as: 'owner' });
    expect(held.answer).toMatchObject({ status: 409, body: { code: 'session-held' } });
    await session(world, { type: 'release', sessionId });
    const noReason = await mark(world, { sequence: 4 }, { as: 'owner' });
    expect(noReason.answer).toMatchObject({ status: 409, body: { code: 'reason-needed' } });
    const done = await mark(world, { sequence: 4, reason: 'wrongGame' }, { as: 'owner' });
    expect(done.answer).toMatchObject({
      status: 200,
      body: { status: 'not-started', sequence: 5 },
    });
    expect(await snapshotOf(world)).toMatchObject({
      status: 'scheduled',
      score: { home: 0, away: 0 },
    });
  });

  it('refuses a game not started, a final one, one moved on since it was seen, each with its code', async () => {
    const world = trackerWorld();
    const notStarted = await mark(world, { sequence: 0 }, { id: games.lionsTigers });
    expect(notStarted.answer).toMatchObject({ status: 409, body: { code: 'game-not-started' } });
    // The stand-in's Hawks v Bears is live with no plays from the tracker yet.
    const untracked = await mark(world, { sequence: 0 });
    expect(untracked.answer).toMatchObject({ status: 409, body: { code: 'not-tracked' } });
    const decided = await mark(world, { sequence: 0 }, { as: 'owner', id: games.decided });
    // Its final score was entered by hand: there were never any plays to clear.
    expect(decided.answer).toMatchObject({ status: 409, body: { code: 'entered-by-hand' } });
    const sessionId = await openSession(world);
    await send(world, sessionId, tipOff());
    const stale = await mark(world, { sequence: 2 });
    expect(stale.answer).toMatchObject({ status: 409, body: { code: 'changed-since-read' } });
  });

  it('turns away a visitor and a bad body with the tracker’s own refusals', async () => {
    const world = trackerWorld();
    expect((await mark(world, { sequence: 0 }, { as: 'visitor' })).answer).toEqual({
      status: 401,
      body: { error: 'signed-out' },
    });
    for (const body of [
      undefined,
      {},
      { sequence: -1 },
      // The reason is one of a fixed list, never typed (A-6).
      { sequence: 3, reason: 'Wrong game' },
    ]) {
      const answer = (await mark(world, body)).answer;
      expect(answer.status, JSON.stringify(body)).toBe(400);
      expect(answer.body).toMatchObject({ error: 'invalid-input' });
    }
    const badId = await mark(world, { sequence: 0 }, { id: 'not-a-game' });
    expect(badId.answer).toMatchObject({ status: 404, body: { code: 'unknown-game' } });
  });

  it("never reaches league B's game through league A's address", async () => {
    const world = trackerWorld();
    const sessionId = await openSession(world);
    await send(world, sessionId, tipOff());
    // The owner holds both leagues: the game is simply not in the other one.
    const owner = await mark(world, { sequence: 3 }, { as: 'owner', league: 'other' });
    expect(owner.answer).toMatchObject({ status: 404, body: { code: 'unknown-game' } });
    // The scorekeeper holds nothing in the other league.
    const scorekeeper = await mark(world, { sequence: 3 }, { league: 'other' });
    expect(scorekeeper.answer).toMatchObject({ status: 403, body: { code: 'not-allowed' } });
    expect(await snapshotOf(world)).toMatchObject({ status: 'live', sequence: 3 });
  });
});

describe('the words for marking a game not started (T-187)', () => {
  it('has words for every refusal and every reason', () => {
    const keys = [
      ...notStartedRefusals.map((code) => `tracker.notStarted.refused.${code}`),
      ...notStartedReasons.map((reason) => `tracker.notStarted.reasons.${reason}`),
    ];
    expect(keys.filter((key) => !Object.hasOwn(en, key))).toEqual([]);
  });

  it('tells a scorekeeper refused for a play that stands that Undo is the way out', () => {
    const words = en['tracker.notStarted.refused.not-allowed'];
    expect(words).toContain('Undo them first');
    expect(words).toContain('a league admin can clear it with a reason');
  });
});
