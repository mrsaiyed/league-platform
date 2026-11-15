// The scorekeeper's reopening through its endpoint, on the web app's made-up stand-in
// (step 2.120, S-36): the device asks first whether Reopen is offered and until when;
// End game tapped too soon on the tablet is reopened with a reason, the same request
// sent again is answered the same, and the same tablet opens the game again and carries
// on; past the league's minutes the answer is a refusal whose words say an admin can
// reopen it. Every answer is read as the tracker reads it, through the contract's
// `ownReopenReply`, `ownReopenOffer` and `ownTrackerRefusal`. The stand-in's clock is
// this process's (Date.now), moved here with fake dates.
import {
  CommandReply,
  ownReopenOffer,
  ownReopenReply,
  ownTrackerRefusal,
  reopenRefusalCodes,
  SessionReply,
} from '@srleagues/contracts';
import { en } from '@srleagues/site';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reopenOfferRequest, reopenTrackedGameRequest } from './reopen-game-endpoint.ts';
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
const reason = 'End game tapped by mistake';
let requests = 0;
const requestId = () => {
  requests += 1;
  return `01900000-0000-7000-8000-0000e1${String(requests).padStart(6, '0')}`;
};

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

type As = { as?: Person; league?: League; at?: string };

async function reopen(
  world: World,
  body: unknown,
  { as = 'scorekeeper', league = 'live', at = game }: As = {},
) {
  const context = await world.contextAs(as, league, ['games', at, 'reopen']);
  const outcome = await reopenTrackedGameRequest(
    context,
    at,
    body,
    world.tracker,
    world.publishPlays,
  );
  const { status, body: answer } = outcome.answer;
  return {
    outcome,
    status,
    reply: ownReopenReply(status, answer),
    refusal: ownTrackerRefusal(status, answer),
  };
}

async function offer(world: World, { as = 'scorekeeper', league = 'live', at = game }: As = {}) {
  const context = await world.contextAs(as, league, ['games', at, 'reopen']);
  const { status, body } = await reopenOfferRequest(context, at, world.tracker);
  return { status, offer: ownReopenOffer(status, body), refusal: ownTrackerRefusal(status, body) };
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

describe('GET …/games/{game}/reopen', () => {
  it('tells the device before the tap: until when for the one who ended it, always for an admin, who ended it', async () => {
    const world = trackerWorld();
    const { endedAt } = await endedOnTablet(world);
    vi.setSystemTime(endedAt + minutes(10));
    expect((await offer(world)).offer).toEqual({
      reopen: { when: 'until', until: endedAt + minutes(30) },
      endedBy: { displayName: 'Sam Scorekeeper' },
      sentAt: endedAt + minutes(10),
    });
    expect((await offer(world, { as: 'owner' })).offer?.reopen).toEqual({ when: 'always' });
    vi.setSystemTime(endedAt + minutes(31));
    expect((await offer(world)).offer?.reopen).toEqual({ when: 'no', code: 'reopen-time-over' });
  });

  it('says "no" with the reason for a game not over, and turns away who may not score it', async () => {
    const world = trackerWorld();
    expect((await offer(world)).offer).toMatchObject({
      reopen: { when: 'no', code: 'game-not-decided' },
      endedBy: null,
    });
    expect((await offer(world, { at: games.decided })).offer?.reopen).toEqual({
      when: 'no',
      code: 'not-ended-by-tracker',
    });
    expect((await offer(world, { as: 'visitor' })).refusal).toEqual({ error: 'signed-out' });
    expect((await offer(world, { as: 'coach' })).refusal).toEqual({ error: 'not-allowed' });
    expect((await offer(world, { as: 'owner', league: 'other' })).refusal).toEqual({
      error: 'not-found',
    });
    expect((await offer(world, { at: 'not-a-game' })).refusal).toEqual({ error: 'not-found' });
  });
});

describe('POST …/games/{game}/reopen', () => {
  it('reopens at 29 minutes; the tablet opens the game again and carries on', async () => {
    const world = trackerWorld();
    const { sessionId, sequence, endedAt } = await endedOnTablet(world);
    vi.setSystemTime(endedAt + minutes(29));
    const { outcome, reply } = await reopen(world, { requestId: requestId(), reason, sequence });
    expect(reply).toEqual({
      status: 'reopened',
      sequence: sequence + 1,
      sentAt: endedAt + minutes(29),
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

  it('answers the same request "reopened" again when its answer was lost; no sequence needed', async () => {
    const world = trackerWorld();
    const { sequence } = await endedOnTablet(world);
    const body = { requestId: requestId(), reason };
    expect((await reopen(world, body)).reply).toMatchObject({
      status: 'reopened',
      sequence: sequence + 1,
    });
    const again = await reopen(world, body);
    expect(again.reply).toMatchObject({ status: 'reopened', sequence: sequence + 1 });
    // A new request for the game now live is told the truth.
    expect((await reopen(world, { requestId: requestId(), reason })).reply).toMatchObject({
      status: 'refused',
      code: 'game-not-decided',
    });
  });

  it('is refused at 31 minutes, in words that say an admin can reopen it', async () => {
    const world = trackerWorld();
    const { sequence, endedAt } = await endedOnTablet(world);
    vi.setSystemTime(endedAt + minutes(31));
    const late = await reopen(world, { requestId: requestId(), reason, sequence });
    expect(late.status).toBe(403);
    expect(late.reply).toEqual({
      status: 'refused',
      code: 'reopen-time-over',
      endedBy: { displayName: 'Sam Scorekeeper' },
      sentAt: endedAt + minutes(31),
    });
    expect(late.outcome.afterwards).toBeNull();
    expect(en['error.games.reopen_tracked_game.reopen-time-over']).toContain(
      'A league admin can reopen it.',
    );
    // The owner may correct games, so still may.
    expect((await reopen(world, { requestId: requestId(), reason }, { as: 'owner' })).status).toBe(
      200,
    );
  });

  it('needs a reason and a request id; a stale sequence is refused', async () => {
    const world = trackerWorld();
    const { sequence } = await endedOnTablet(world);
    for (const body of [{ requestId: requestId() }, { requestId: requestId(), reason: '  ' }]) {
      expect((await reopen(world, body)).reply).toMatchObject({
        status: 'refused',
        code: 'reason-needed',
      });
    }
    expect((await reopen(world, { reason })).refusal).toMatchObject({ error: 'invalid-input' });
    expect((await reopen(world, undefined)).refusal).toMatchObject({ error: 'invalid-input' });
    const stale = await reopen(world, { requestId: requestId(), reason, sequence: sequence - 1 });
    expect(stale.reply).toMatchObject({ status: 'refused', code: 'changed-since-read' });
  });

  it("turns away a visitor, someone who may not score, and league B's game through A's address", async () => {
    const world = trackerWorld();
    await endedOnTablet(world);
    const body = () => ({ requestId: requestId(), reason });
    expect((await reopen(world, body(), { as: 'visitor' })).refusal).toEqual({
      error: 'signed-out',
    });
    expect((await reopen(world, body(), { as: 'coach' })).reply).toMatchObject({
      code: 'not-allowed',
    });
    // The owner holds both leagues: the game is simply not in the other one.
    expect((await reopen(world, body(), { as: 'owner', league: 'other' })).reply).toMatchObject({
      code: 'game-not-found',
    });
    expect((await reopen(world, body(), { league: 'other' })).reply).toMatchObject({
      code: 'not-allowed',
    });
    expect((await reopen(world, body(), { at: 'not-a-game' })).reply).toMatchObject({
      code: 'game-not-found',
    });
    // Still final in its own league.
    expect((await reopen(world, body())).status).toBe(200);
  });

  it('answers a game whose score was entered by hand: not ended from the tracker', async () => {
    const world = trackerWorld();
    const outcome = await reopen(world, { requestId: requestId(), reason }, { at: games.decided });
    expect(outcome.reply).toMatchObject({ status: 'refused', code: 'not-ended-by-tracker' });
  });

  it('has words in the message files for every refusal, the button, the question and the reason', () => {
    for (const code of reopenRefusalCodes) {
      const key = `error.games.reopen_tracked_game.${code}`;
      expect(Object.hasOwn(en, key), key).toBe(true);
    }
    expect(en['error.games.reopen_tracked_game.not-ended-by-you']).toContain('{name}');
    for (const key of [
      'tracker.reopen.button',
      'tracker.reopen.until',
      'tracker.reopen.adminCan',
      'tracker.reopen.question',
      'tracker.reopen.reasonLabel',
      'tracker.reopen.confirm',
      'tracker.reopen.cancel',
      'tracker.reopen.noConnection',
    ] as const) {
      expect(en[key].length, key).toBeGreaterThan(0);
    }
    expect(en['tracker.reopen.reasonReady']).toBe('End game tapped by mistake');
  });
});
