// The rosters address for the scorekeeper's device (record 058) and the players the
// scorer's table adds through the commands address, over the web app's stand-in: the
// device that adds a number-only player, or another one, reads them back in the shape
// the page hands it; the same batch twice adds no one twice; visitors, people who may
// not score the game and other leagues are turned away.
import { CommandReply, TrackerRosters } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  bears,
  bearsNames,
  games,
  tap,
  trackerWorld,
  type League,
  type Person,
} from './tracker-endpoints.test-helper.ts';
import { trackerRostersRequest } from './tracker-rosters-endpoint.ts';

type World = ReturnType<typeof trackerWorld>;

async function read(
  world: World,
  { as = 'scorekeeper', league = 'live', game = games.hawksBears } = {} as {
    as?: Person;
    league?: League;
    game?: string;
  },
) {
  const context = await world.contextAs(as, league, ['games', game, 'rosters']);
  return trackerRostersRequest(context, game, world.tracker);
}

async function openGame(world: World, game = games.hawksBears) {
  const opened = await scoringSessionRequest(
    await world.contextAs('scorekeeper', 'live', ['games', game, 'session']),
    game,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  return (opened.body as { sessionId: string }).sessionId;
}

async function send(world: World, sessionId: string, commands: unknown[], game = games.hawksBears) {
  const sent = await sendTrackerCommands(
    await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']),
    game,
    { protocolVersion: 2, sessionId, commands },
    world.tracker,
    async () => {},
  );
  return sent.answer;
}

const walkUp = (n: number) => `01900000-0000-4000-8000-0000000fa${String(n).padStart(3, '0')}`;

describe('GET …/games/{game}/rosters', () => {
  it('gives both teams’ players in the page’s shape, staff-only ones included, never cached', async () => {
    const world = trackerWorld();
    const answer = await read(world);
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    const body = TrackerRosters.parse(answer.body);
    expect(body).toMatchObject({ gameId: games.hawksBears, recording: 'live' });
    // The Bears show their numbers to staff only; the scorekeeper is staff.
    expect(body.players.filter((p) => p.teamId === body.awayTeamId).map((p) => p.personId)).toEqual(
      expect.arrayContaining(bears),
    );
    expect(body.players.map((p) => p.firstName)).toEqual(
      expect.arrayContaining(bearsNames.slice(0, 5)),
    );
  });

  it('lists a player added at the table a moment ago: by number only, with no name', async () => {
    const world = trackerWorld();
    const sessionId = await openGame(world);
    const commands = [
      tap({ type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '12', name: '' }),
      tap({ type: 'add-player', side: 'away', playerId: walkUp(2), jersey: '', name: 'Yusuf Ali' }),
      tap({ type: 'lineup', side: 'away', playerIds: [walkUp(1)] }),
      tap({ type: 'start' }),
      tap({ type: 'score', side: 'away', playerId: walkUp(1), points: 2 }),
    ];
    const first = await send(world, sessionId, commands);
    expect(first.status).toBe(200);
    expect(CommandReply.parse(first.body).results.map((r) => r.status)).toEqual(
      commands.map(() => 'accepted'),
    );
    // Sent again (the answer was lost): every one a duplicate, no one added twice.
    const again = await send(world, sessionId, commands);
    expect(CommandReply.parse(again.body).results.map((r) => r.status)).toEqual(
      commands.map(() => 'duplicate'),
    );
    const body = TrackerRosters.parse((await read(world)).body);
    const added = body.players.filter((p) => p.personId === walkUp(1) || p.personId === walkUp(2));
    expect(added).toEqual([
      {
        teamId: body.awayTeamId,
        personId: walkUp(1),
        firstName: '',
        lastName: '',
        ordinal: null,
        jerseyNumber: '12',
        left: false,
        addedAtGameId: games.hawksBears,
        toReview: true,
      },
      {
        teamId: body.awayTeamId,
        personId: walkUp(2),
        firstName: 'Yusuf',
        lastName: 'Ali',
        ordinal: null,
        jerseyNumber: null,
        left: false,
        addedAtGameId: games.hawksBears,
        toReview: true,
      },
    ]);
  });

  it('is turned away for a visitor, someone who may not score, another league and a bad address', async () => {
    const world = trackerWorld();
    expect(await read(world, { as: 'visitor' })).toEqual({
      status: 401,
      body: { error: 'signed-out' },
    });
    expect(await read(world, { as: 'coach' })).toEqual({
      status: 403,
      body: { error: 'not-allowed' },
    });
    expect(await read(world, { as: 'owner', league: 'other' })).toEqual({
      status: 404,
      body: { error: 'unknown-game' },
    });
    expect(await read(world, { league: 'other' })).toEqual({
      status: 403,
      body: { error: 'not-allowed' },
    });
    expect(await read(world, { game: 'not-a-game' })).toEqual({
      status: 404,
      body: { error: 'unknown-game' },
    });
  });
});

describe('players at the table through POST …/games/{game}/commands', () => {
  it('refuses a change of players from someone who may not score the game, adding no one', async () => {
    const world = trackerWorld();
    const sessionId = await openGame(world);
    const sent = await sendTrackerCommands(
      await world.contextAs('coach', 'live', ['games', games.hawksBears, 'commands']),
      games.hawksBears,
      {
        protocolVersion: 2,
        sessionId,
        commands: [
          tap({ type: 'add-player', side: 'away', playerId: walkUp(3), jersey: '9', name: '' }),
        ],
      },
      world.tracker,
      async () => {},
    );
    expect(sent.answer).toEqual({ status: 403, body: { error: 'not-allowed' } });
    const body = TrackerRosters.parse((await read(world)).body);
    expect(body.players.map((p) => p.personId)).not.toContain(walkUp(3));
  });

  it('is not taken from a tracker of version 1, which only taps', async () => {
    const world = trackerWorld();
    const sessionId = await openGame(world);
    const sent = await sendTrackerCommands(
      await world.contextAs('scorekeeper', 'live', ['games', games.hawksBears, 'commands']),
      games.hawksBears,
      {
        protocolVersion: 1,
        sessionId,
        commands: [
          tap({ type: 'add-player', side: 'away', playerId: walkUp(4), jersey: '9', name: '' }),
        ],
      },
      world.tracker,
      async () => {},
    );
    expect(sent.answer.status).toBe(400);
    expect(sent.answer.body).toMatchObject({ error: 'invalid-input' });
  });
});
