// The tracker's controller against the real endpoints (step 2.34's done test): the
// browser's transports reach the commands, session and state handlers in this process,
// over the web app's made-up stand-in. Tapping offline, reconnecting, a tab closed with
// taps waiting, a refusal (T-113) and a takeover (T6 §5).
import { TrackerGameState } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import {
  bears,
  games,
  hawks,
  liveLeagueId,
  type Person,
} from '../../server/tracker-endpoints.test-helper.ts';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import type { QueueStorage } from './queue-storage.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;
const minute = 60_000;
/** Someone on neither team. */
const stranger = '01900000-0000-7000-8000-00000000dead';

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00d0${commandNumber.toString(16).padStart(8, '0')}`;
};

function device(
  network: EndpointNetwork,
  {
    as = 'scorekeeper',
    deviceId = 'tablet-1',
    storage = createMemoryQueueStorage(),
    clock = createManualClock(),
    game = gameId,
  }: {
    game?: string;
    as?: Person;
    deviceId?: string;
    storage?: QueueStorage;
    clock?: ReturnType<typeof createManualClock>;
  } = {},
) {
  const fetch = network.fetchAs(as);
  const controller = createTrackerController({
    gameId: game,
    deviceId,
    storage,
    clock,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId: game, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId: game, fetch }),
  });
  return { controller, storage, clock };
}

/** The game as the server holds it, read as the owner. */
async function serverGame(network: EndpointNetwork) {
  const context = await network.world.contextAs('owner', 'live', ['games', gameId, 'state']);
  const answer = await trackerStateRequest(context, gameId, network.world.tracker);
  return TrackerGameState.parse(answer.body) as { sequence: number; state: basketball.GameState };
}

const scoreOf = (state: basketball.GameState | null) => {
  if (state === null) throw new Error('no game');
  const { home, away } = basketball.derive(state).teams;
  return { home: home.score, away: away.score };
};

const tipOff: TapInput[] = [
  { type: 'lineup', side: 'home', playerIds: hawks },
  { type: 'lineup', side: 'away', playerIds: bears },
];
const basket = (side: 'home' | 'away', playerId: string, points: 1 | 2 | 3 = 2): TapInput => ({
  type: 'score',
  side,
  playerId,
  points,
});

async function tapAll(controller: ReturnType<typeof device>['controller'], inputs: TapInput[]) {
  for (const input of inputs) {
    const result = await controller.tap(input);
    if (!result.ok) throw new Error(`tap not taken: ${result.reason}`);
  }
}

describe('tracker controller: opening and tapping', () => {
  it('opens the game, applies each tap at once, and the queue saves it on the server', async () => {
    const network = endpointNetwork();
    const { controller } = device(network);
    expect(controller.status().mode).toEqual({ kind: 'opening' });
    await controller.start();
    await controller.idle();
    const opened = controller.status();
    expect(opened.mode).toEqual({ kind: 'scoring' });
    expect(opened.serverSequence).toBe(0);
    expect(opened.game?.status).toBe('scheduled');

    const shown: number[] = [];
    controller.subscribe((status) => {
      if (status.game !== null) shown.push(scoreOf(status.game).home);
    });
    await tapAll(controller, [...tipOff, basket('home', hawks[0] ?? '', 3)]);
    // Shown as soon as it is stored, before the server has answered for it.
    expect(scoreOf(controller.status().game)).toEqual({ home: 3, away: 0 });
    expect(shown).toContain(3);
    await controller.idle();
    expect(controller.status().queue.waiting).toBe(0);
    const server = await serverGame(network);
    expect(server.sequence).toBe(3);
    expect(scoreOf(server.state)).toEqual({ home: 3, away: 0 });
    expect(server.state.plays).toEqual(controller.status().game?.plays);
  });

  it("answers the engine's own no on the device, storing and sending nothing", async () => {
    const network = endpointNetwork();
    const { controller, storage } = device(network);
    await controller.start();
    await controller.idle();
    // Nothing has been tapped: there is nothing to undo.
    const result = await controller.tap({ type: 'undo' });
    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(await storage.list(gameId)).toEqual([]);
    expect(network.reached.filter((r) => r.endsWith('commands'))).toEqual([]);
  });
});

describe('tracker controller: offline and reconnecting (T6 §4)', () => {
  it('keeps scoring with no network and sends everything, once each, when it is back', async () => {
    const network = endpointNetwork();
    const { controller, clock } = device(network);
    await controller.start();
    await tapAll(controller, tipOff);
    await controller.idle();

    network.mode = 'down';
    await tapAll(controller, [basket('home', hawks[0] ?? ''), basket('away', bears[1] ?? '', 3)]);
    expect(scoreOf(controller.status().game)).toEqual({ home: 2, away: 3 });
    await clock.advance(5 * minute);
    expect(controller.status().queue.waiting).toBe(2);
    expect(controller.status().queue.unansweredSince).not.toBeNull();
    expect(controller.status().mode).toEqual({ kind: 'scoring' });

    // The server takes the next send, but its answer is lost: sent again, it counts once.
    network.mode = 'answers-lost';
    controller.online();
    await controller.idle();
    expect(controller.status().queue.waiting).toBe(2);
    expect((await serverGame(network)).sequence).toBe(4);

    network.mode = 'up';
    controller.online();
    await controller.idle();
    expect(controller.status().queue.waiting).toBe(0);
    expect(controller.status().queue.unansweredSince).toBeNull();
    const server = await serverGame(network);
    expect(server.sequence).toBe(4);
    expect(scoreOf(server.state)).toEqual({ home: 2, away: 3 });
  });

  it('opens with no network by trying again, and scores once the network is back', async () => {
    const network = endpointNetwork();
    network.mode = 'down';
    const { controller, clock } = device(network);
    await controller.start();
    await clock.advance(minute);
    expect(controller.status().mode).toEqual({ kind: 'opening' });
    expect((await controller.tap(tipOff[0] as TapInput)).ok).toBe(false);
    network.mode = 'up';
    controller.online();
    await controller.idle();
    expect(controller.status().mode).toEqual({ kind: 'scoring' });
  });

  it('opens a tab closed with taps waiting where it was, and sends them', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const first = device(network, { storage });
    await first.controller.start();
    await tapAll(first.controller, tipOff);
    await first.controller.idle();
    network.mode = 'down';
    await tapAll(first.controller, [basket('away', bears[0] ?? '', 3)]);
    // The tab closes: nothing more from it. Its lease is kept, as a tap is waiting.
    await first.controller.leave();
    expect(network.reached).not.toContain('POST session:release');

    network.mode = 'up';
    const second = device(network, { storage });
    await second.controller.start();
    // Shown at once on the server's state, before it is even sent.
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 0, away: 3 });
    await second.controller.idle();
    expect(second.controller.status().queue.waiting).toBe(0);
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 3 });
    expect(second.controller.status().mode).toEqual({ kind: 'scoring' });
  });
});

describe('tracker controller: a refused tap (T-113)', () => {
  it('reloads the server’s state, rebuilds without the refused tap, and lists it', async () => {
    const network = endpointNetwork();
    const { controller } = device(network);
    await controller.start();
    await controller.idle();
    // The device's engine knows no rosters; the server refuses a player not on the team.
    const wrong: TapInput = {
      type: 'lineup',
      side: 'home',
      playerIds: [...hawks.slice(0, 4), stranger],
    };
    await tapAll(controller, [tipOff[1] as TapInput]);
    await controller.idle();
    await tapAll(controller, [wrong, basket('away', bears[2] ?? '')]);
    expect(
      basketball.derive(controller.status().game ?? basketball.newGame()).teams.home.onCourt,
    ).toHaveLength(5);
    await controller.idle();

    const status = controller.status();
    expect(status.reloading).toBe(false);
    expect(status.notApplied.map((r) => r.command.input)).toEqual([wrong]);
    expect(status.notApplied[0]?.refusal.code).toBe('rule');
    // The rest went on; the game is the server's: nobody on the floor for the home side.
    const server = await serverGame(network);
    expect(server.sequence).toBe(2);
    // Loaded on opening, and again after the refusal.
    expect(network.reached.filter((r) => r === 'GET state')).toHaveLength(2);
    expect(status.serverSequence).toBeGreaterThanOrEqual(1);
    expect(status.game?.plays).toEqual(server.state.plays);
    expect(basketball.derive(status.game ?? server.state).teams.home.onCourt).toEqual([]);
    expect(scoreOf(status.game)).toEqual({ home: 0, away: 2 });
    expect(status.queue.refused).toHaveLength(1);

    // Once the scorekeeper has seen it, it is dropped; the right line-up goes in.
    await controller.dismissNotApplied();
    await tapAll(controller, [tipOff[0] as TapInput]);
    await controller.idle();
    expect(controller.status().notApplied).toEqual([]);
    expect(controller.status().queue.refused).toEqual([]);
    expect((await serverGame(network)).sequence).toBe(3);
  });
});

describe('tracker controller: another device takes over (T6 §5)', () => {
  it('turns read-only, says why, and lists what it had not sent', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tapAll(tablet.controller, [...tipOff, basket('home', hawks[1] ?? '')]);
    await tablet.controller.idle();

    // The tablet loses the network with two taps not yet sent.
    network.mode = 'down';
    await tapAll(tablet.controller, [
      basket('home', hawks[2] ?? ''),
      basket('away', bears[0] ?? ''),
    ]);
    network.mode = 'up';

    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    const offered = laptop.controller.status().mode;
    expect(offered).toMatchObject({
      kind: 'held-by-other',
      holder: { displayName: 'Sam Scorekeeper' },
    });
    expect(await laptop.controller.takeOver()).toEqual({ ok: true });
    await laptop.controller.idle();
    expect(laptop.controller.status().mode).toEqual({ kind: 'scoring' });
    // The laptop carries on from what the server has: the tablet's saved taps only.
    expect(scoreOf(laptop.controller.status().game)).toEqual({ home: 2, away: 0 });

    // The tablet's queue tries again; the server says it no longer holds the game.
    tablet.controller.online();
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
    expect(status.notSaved.map((c) => c.input)).toEqual([
      basket('home', hawks[2] ?? ''),
      basket('away', bears[0] ?? ''),
    ]);
    // It shows what the server holds, not its own unsent taps, and takes no more.
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    expect(await tablet.controller.tap(basket('home', hawks[0] ?? ''))).toEqual({
      ok: false,
      reason: 'not-scoring',
    });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 0 });

    await tablet.controller.dismissNotSaved();
    expect(tablet.controller.status().notSaved).toEqual([]);
    expect(await tablet.storage.list(gameId)).toEqual([]);

    // The laptop scores on.
    await tapAll(laptop.controller, [basket('away', bears[0] ?? '', 3)]);
    await laptop.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 3 });
  });

  it('learns of a takeover from its renewal, with nothing waiting', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tablet.controller.idle();
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();

    await tablet.clock.advance(31_000);
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
    expect(tablet.controller.status().notSaved).toEqual([]);

    // Taking it back: the tablet is shown the laptop's holder and confirms.
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toMatchObject({ kind: 'held-by-other' });
    await tablet.controller.takeOver();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'scoring' });
  });

  it('never sends the taps it listed as not saved, even after the page is reloaded', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const tablet = device(network, { storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, [...tipOff, basket('home', hawks[1] ?? '')]);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, [basket('home', hawks[2] ?? '')]);
    network.mode = 'up';

    // The laptop takes over, scores, and leaves: the game is free again.
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    await tapAll(laptop.controller, [basket('home', hawks[2] ?? '')]);
    await laptop.controller.idle();
    await laptop.controller.leave();

    tablet.controller.online();
    await tablet.controller.idle();
    // Its session ended when the laptop took over ("released" now that nobody holds it).
    expect(tablet.controller.status().mode).toMatchObject({ kind: 'read-only' });
    expect(tablet.controller.status().notSaved).toHaveLength(1);
    await tablet.controller.leave();

    // The page is reloaded before the taps were dismissed: it opens into a new session.
    const reloaded = device(network, { storage });
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().mode).toEqual({ kind: 'scoring' });
    // Still listed, so they can be entered again; never sent.
    expect(reloaded.controller.status().notSaved.map((c) => c.input)).toEqual([
      basket('home', hawks[2] ?? ''),
    ]);
    expect(reloaded.controller.status().queue.waiting).toBe(0);
    expect(scoreOf(reloaded.controller.status().game)).toEqual({ home: 4, away: 0 });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 4, away: 0 });
    await reloaded.controller.dismissNotSaved();
    expect(reloaded.controller.status().notSaved).toEqual([]);
    expect(await storage.list(gameId)).toEqual([]);
  });

  it('never sends taps a closed tab left waiting once another device has had the game', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const tablet = device(network, { storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, [basket('away', bears[0] ?? '', 3)]);
    await tablet.controller.leave();
    network.mode = 'up';

    // While the tab is closed, the laptop takes the game, enters the basket, and leaves.
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    await tapAll(laptop.controller, [basket('away', bears[0] ?? '', 3)]);
    await laptop.controller.idle();
    await laptop.controller.leave();

    const reopened = device(network, { storage });
    await reopened.controller.start();
    await reopened.controller.idle();
    expect(reopened.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(reopened.controller.status().notSaved).toHaveLength(1);
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 3 });
    expect(scoreOf(reopened.controller.status().game)).toEqual({ home: 0, away: 3 });
  });

  it('releases the game on leaving when nothing is waiting', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    await tablet.controller.leave();
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    expect(laptop.controller.status().mode).toEqual({ kind: 'scoring' });
  });
});

describe('tracker controller: a game it may not score', () => {
  it('is read-only and says why: signed out, not allowed, or not a game to score now', async () => {
    const network = endpointNetwork();
    const cases = [
      { as: 'visitor', game: gameId, reason: 'signed-out' },
      { as: 'coach', game: gameId, reason: 'not-allowed' },
      { as: 'scorekeeper', game: games.decided, reason: 'game-not-live' },
    ] as const;
    for (const { as, game, reason } of cases) {
      const { controller } = device(network, { as, game });
      await controller.start();
      await controller.idle();
      expect(controller.status().mode).toEqual({ kind: 'read-only', reason });
      expect(controller.status().game).toBeNull();
    }
    expect(network.reached.filter((r) => r.endsWith('commands') || r.endsWith('state'))).toEqual(
      [],
    );
  });
});
