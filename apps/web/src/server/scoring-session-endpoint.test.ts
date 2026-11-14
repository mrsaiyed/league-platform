import { SessionReply } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { games, trackerWorld, type League, type Person } from './tracker-endpoints.test-helper.ts';

async function ask(
  world: ReturnType<typeof trackerWorld>,
  body: unknown,
  { as = 'scorekeeper', league = 'live', game = games.hawksBears } = {} as {
    as?: Person;
    league?: League;
    game?: string;
  },
) {
  const context = await world.contextAs(as, league, ['games', game, 'session']);
  const answer = await scoringSessionRequest(context, game, body, world.tracker);
  return { status: answer.status, reply: SessionReply.safeParse(answer.body), body: answer.body };
}

describe('POST …/games/{game}/session', () => {
  it('opens, renews and releases a session, and shows another scorekeeper who holds it by name', async () => {
    const world = trackerWorld();
    const opened = await ask(world, { type: 'open', deviceId: 'tablet-1' });
    expect(opened.status).toBe(200);
    if (!opened.reply.success || opened.reply.data.status !== 'held-by-you') {
      throw new Error('expected the session');
    }
    const { sessionId } = opened.reply.data;
    const renewed = await ask(world, { type: 'renew', sessionId });
    expect(renewed.reply.data).toMatchObject({ status: 'held-by-you', sessionId });

    const other = await ask(world, { type: 'open', deviceId: 'laptop' }, { as: 'owner' });
    expect(other.status).toBe(200);
    expect(other.reply.data).toMatchObject({
      status: 'held-by-other',
      holder: { displayName: 'Sam Scorekeeper' },
    });
    // The account never travels to another device, only the name.
    expect(JSON.stringify(other.body)).not.toContain('accountId');

    const released = await ask(world, { type: 'release', sessionId });
    expect(released.reply.data).toMatchObject({ status: 'ended', reason: 'released' });
    const free = await ask(world, { type: 'open', deviceId: 'laptop' }, { as: 'owner' });
    expect(free.reply.data).toMatchObject({ status: 'held-by-you' });
  });

  it('takes over after the scorekeeper confirms, and the first device is told it ended', async () => {
    const world = trackerWorld();
    const opened = await ask(world, { type: 'open', deviceId: 'tablet-1' });
    const first = opened.reply.success && opened.reply.data;
    if (!first || first.status !== 'held-by-you') throw new Error('expected the session');
    const seen = await ask(world, { type: 'open', deviceId: 'laptop' }, { as: 'owner' });
    const since =
      seen.reply.success && seen.reply.data.status === 'held-by-other'
        ? seen.reply.data.holder.since
        : -1;
    const unconfirmed = await ask(
      world,
      { type: 'take-over', deviceId: 'laptop', confirmed: false, expectedHolderSince: since },
      { as: 'owner' },
    );
    expect(unconfirmed.status).toBe(400);
    const taken = await ask(
      world,
      { type: 'take-over', deviceId: 'laptop', confirmed: true, expectedHolderSince: since },
      { as: 'owner' },
    );
    expect(taken.reply.data).toMatchObject({ status: 'held-by-you' });
    const renewed = await ask(world, { type: 'renew', sessionId: first.sessionId });
    expect(renewed.reply.data).toMatchObject({ status: 'ended', reason: 'taken-over' });
  });

  it("refuses league B's game asked for through league A's address", async () => {
    const world = trackerWorld();
    const owner = await ask(
      world,
      { type: 'open', deviceId: 'laptop' },
      { as: 'owner', league: 'other' },
    );
    expect(owner.status).toBe(404);
    expect(owner.reply.data).toMatchObject({ status: 'refused', code: 'unknown-game' });
    const scorekeeper = await ask(
      world,
      { type: 'open', deviceId: 'tablet-1' },
      { league: 'other' },
    );
    expect(scorekeeper.status).toBe(403);
    expect(scorekeeper.reply.data).toMatchObject({ status: 'refused', code: 'not-allowed' });
    // The game is still free in its own league.
    const own = await ask(world, { type: 'open', deviceId: 'tablet-1' });
    expect(own.reply.data).toMatchObject({ status: 'held-by-you' });
  });

  it('says a decided game cannot be scored now', async () => {
    const world = trackerWorld();
    const decided = await ask(
      world,
      { type: 'open', deviceId: 'laptop' },
      { as: 'owner', game: games.decided },
    );
    expect(decided.status).toBe(409);
    expect(decided.reply.data).toMatchObject({ status: 'refused', code: 'game-not-live' });
  });

  it('turns away a visitor, someone who may not score, and a request that is not one', async () => {
    const world = trackerWorld();
    const open = { type: 'open', deviceId: 'tablet-1' };
    expect((await ask(world, open, { as: 'visitor' })).status).toBe(401);
    expect((await ask(world, open, { as: 'coach' })).status).toBe(403);
    expect((await ask(world, undefined)).status).toBe(400);
    // The address names the game: a body naming one is not a session request.
    expect((await ask(world, { ...open, gameId: games.lionsTigers })).status).toBe(400);
    expect((await ask(world, open, { game: 'not-a-game' })).status).toBe(404);
  });
});
