import { TrackerGameState } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
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
import { trackerStateRequest } from './tracker-state-endpoint.ts';

async function read(
  world: ReturnType<typeof trackerWorld>,
  { as = 'scorekeeper', league = 'live', game = games.hawksBears } = {} as {
    as?: Person;
    league?: League;
    game?: string;
  },
) {
  const context = await world.contextAs(as, league, ['games', game, 'state']);
  return trackerStateRequest(context, game, world.tracker);
}

async function scoreABasket(world: ReturnType<typeof trackerWorld>) {
  const game = games.hawksBears;
  const opened = await scoringSessionRequest(
    await world.contextAs('scorekeeper', 'live', ['games', game, 'session']),
    game,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  const { sessionId } = opened.body as { sessionId: string };
  const commands = [
    tap({ type: 'lineup', side: 'home', playerIds: hawks }),
    tap({ type: 'lineup', side: 'away', playerIds: bears }),
    tap({ type: 'start' }),
    tap({ type: 'score', side: 'away', playerId: bears[0], points: 3 }),
  ];
  await sendTrackerCommands(
    await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']),
    game,
    { protocolVersion: 1, sessionId, commands },
    world.tracker,
    async () => {},
  );
  return commands;
}

describe('GET …/games/{game}/state', () => {
  it('gives a game not yet tapped as a new game, never cached', async () => {
    const world = trackerWorld();
    const answer = await read(world);
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    const body = TrackerGameState.parse(answer.body);
    expect(body.sequence).toBe(0);
    expect(body.state).toMatchObject({ status: 'scheduled', plays: [], recent: [] });
  });

  it('gives the state the taps left, staff-only players included, and its sequence number', async () => {
    const world = trackerWorld();
    const commands = await scoreABasket(world);
    const body = TrackerGameState.parse((await read(world)).body);
    expect(body.sequence).toBe(4);
    expect(body.state.status).toBe('live');
    expect(body.state.recent).toEqual(commands.map((c) => c.commandId));
    // The Bears show their numbers to staff only; the scorekeeper is staff and scores them.
    expect(JSON.stringify(body.state)).toContain(bears[0]);
  });

  it('is turned away for a visitor, someone who may not score, and another league', async () => {
    const world = trackerWorld();
    await scoreABasket(world);
    expect(await read(world, { as: 'visitor' })).toEqual({
      status: 401,
      body: { error: 'signed-out' },
    });
    expect(await read(world, { as: 'coach' })).toEqual({
      status: 403,
      body: { error: 'not-allowed' },
    });
    // The owner holds both leagues: the game is simply not in the other one.
    expect(await read(world, { as: 'owner', league: 'other' })).toEqual({
      status: 404,
      body: { error: 'not-found' },
    });
    expect(await read(world, { league: 'other' })).toEqual({
      status: 403,
      body: { error: 'not-allowed' },
    });
    expect(await read(world, { game: 'not-a-game' })).toEqual({
      status: 404,
      body: { error: 'not-found' },
    });
  });
});
