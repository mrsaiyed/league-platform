import { GameSnapshot } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { gameSnapshot } from './game-snapshot-endpoint.ts';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  bears,
  bearsNames,
  games,
  hawks,
  tap,
  trackerWorld,
  type League,
  type Person,
} from './tracker-endpoints.test-helper.ts';

const gameId = (n: number) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;

async function read(
  world: ReturnType<typeof trackerWorld>,
  {
    as = 'visitor',
    league = 'live',
    game = games.hawksBears,
    carriesSignIn = as !== 'visitor',
  } = {} as {
    as?: Person;
    league?: League;
    game?: string;
    carriesSignIn?: boolean;
  },
) {
  const context = await world.contextAs(as, league, ['games', game, 'snapshot']);
  return gameSnapshot(
    { context, holder: await world.holderOf(context), carriesSignIn },
    game,
    world.tracker,
  );
}

/** Tip-off and a basket by each team, through the tracker's own endpoints. */
async function play(world: ReturnType<typeof trackerWorld>) {
  const game = games.hawksBears;
  const sessionContext = await world.contextAs('scorekeeper', 'live', ['games', game, 'session']);
  const opened = await scoringSessionRequest(
    sessionContext,
    game,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  const { sessionId } = opened.body as { sessionId: string };
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']);
  await sendTrackerCommands(
    context,
    game,
    {
      protocolVersion: 1,
      sessionId,
      commands: [
        tap({ type: 'lineup', side: 'home', playerIds: hawks }),
        tap({ type: 'lineup', side: 'away', playerIds: bears }),
        tap({ type: 'start' }),
        tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
        tap({ type: 'score', side: 'away', playerId: bears[0], points: 3 }),
      ],
    },
    world.tracker,
    world.publishPlays,
  );
}

describe('GET …/games/{game}/snapshot', () => {
  it("gives the game as it stands, without a staff-only team's players, cached for 2 seconds", async () => {
    const world = trackerWorld();
    await play(world);
    const answer = await read(world);
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ 'Cache-Control': 'public, max-age=0, s-maxage=2' });
    const snapshot = GameSnapshot.parse(answer.body);
    expect(snapshot).toMatchObject({
      gameId: games.hawksBears,
      sequence: 5,
      status: 'live',
      score: { home: 2, away: 3 },
      teams: {
        home: { name: 'Hawks', statsVisible: true },
        away: { name: 'Bears', statsVisible: false },
      },
      latestPlay: { type: 'score', side: 'away', playerName: null, jersey: null, points: 3 },
    });
    expect(snapshot.players.length).toBe(5);
    expect(snapshot.players.every((p) => p.side === 'home')).toBe(true);
    const text = JSON.stringify(snapshot);
    for (const name of bearsNames) expect(text).not.toContain(name);
    for (const id of bears) expect(text).not.toContain(id);
  });

  it('is the same for a signed-in admin: one view for everyone, so it can be cached', async () => {
    const world = trackerWorld();
    await play(world);
    const visitor = await read(world);
    const owner = await read(world, { as: 'owner' });
    const withoutTime = (body: unknown) => ({ ...(body as object), sentAt: 0 });
    expect(withoutTime(owner.body)).toEqual(withoutTime(visitor.body));
  });

  it('is never cached publicly when the request carried a sign-in cookie', async () => {
    const world = trackerWorld();
    await play(world);
    // Signed in, or a visitor whose renewing token the proxy may have just used: the
    // answer may set cookies on its way out, so no shared cache may keep it.
    for (const as of ['owner', 'visitor'] as const) {
      const answer = await read(world, { as, carriesSignIn: true });
      expect(answer.status).toBe(200);
      expect(answer.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    }
  });

  it("refuses league B's game asked for through league A's address", async () => {
    const world = trackerWorld();
    await play(world);
    for (const as of ['visitor', 'owner'] as const) {
      const answer = await read(world, { as, league: 'other' });
      expect(answer).toEqual({
        status: 404,
        body: { error: 'not-found' },
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  });

  it('is "not found" in a league this person may not open, and never cached there', async () => {
    const world = trackerWorld();
    const hidden = await read(world, { league: 'draft' });
    expect(hidden.status).toBe(404);
    // Its staff may open the draft league, which has the same made-up games
    // (stand-in-ports.ts): they get the game, never cached, even with no sign-in cookie.
    for (const carriesSignIn of [true, false]) {
      const staff = await read(world, { as: 'owner', league: 'draft', carriesSignIn });
      expect(staff.status).toBe(200);
      expect(staff.headers).toEqual({ 'Cache-Control': 'private, no-store' });
    }
    // A game it does not have is "not found", and nothing is cached.
    const missing = await read(world, { as: 'owner', league: 'draft', game: gameId(0x99) });
    expect(missing).toEqual({
      status: 404,
      body: { error: 'not-found' },
      headers: { 'Cache-Control': 'no-store' },
    });
    expect((await read(world, { game: 'not-a-game' })).status).toBe(404);
  });

  it('is "not found" for a game of a season still being set up, for everyone', async () => {
    const world = trackerWorld();
    for (const as of ['visitor', 'owner'] as const) {
      const answer = await read(world, { as, game: games.draftSeason });
      expect(answer).toEqual({
        status: 404,
        body: { error: 'not-found' },
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  });

  it('gives a game with no saved plays its score from the game itself', async () => {
    const world = trackerWorld();
    const answer = await read(world, { game: games.decided });
    expect(GameSnapshot.parse(answer.body)).toMatchObject({
      sequence: 0,
      status: 'final',
      score: { home: 44, away: 50 },
      latestPlay: null,
    });
  });
});
