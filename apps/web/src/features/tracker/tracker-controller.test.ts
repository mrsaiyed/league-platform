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
import {
  createFakeServer,
  createManualClock,
  type ManualClock,
} from './tracker-queue.test-helper.ts';
import type { TrackerServer } from './tracker-server.ts';

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
    signedIn = () => as,
    sendTaps = (send) => send,
    askServer = (ask) => ask,
  }: {
    game?: string;
    as?: Person;
    /** Who the device is signed in as at each request, when that changes in a test. */
    signedIn?: () => Person;
    /** Wraps how taps reach the server, to hold an answer back in a test. */
    sendTaps?: (send: typeof globalThis.fetch) => typeof globalThis.fetch;
    /** Wraps the session and state requests, likewise. */
    askServer?: (ask: typeof globalThis.fetch) => typeof globalThis.fetch;
    deviceId?: string;
    storage?: QueueStorage;
    clock?: ReturnType<typeof createManualClock>;
  } = {},
) {
  const fetch: typeof globalThis.fetch = (input, init) => network.fetchAs(signedIn())(input, init);
  const controller = createTrackerController({
    gameId: game,
    deviceId,
    storage,
    clock,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport({
      leagueId: liveLeagueId,
      gameId: game,
      fetch: sendTaps(fetch),
    }),
    server: createFetchTrackerServer({
      leagueId: liveLeagueId,
      gameId: game,
      fetch: askServer(fetch),
    }),
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

describe('tracker controller: a tap made while the state reloads', () => {
  it('stays shown, though a refused tap left the game during the reload', async () => {
    const network = endpointNetwork();
    let holding = false;
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { controller } = device(network, {
      askServer: (ask) => async (input, init) => {
        const answer = await ask(input, init);
        if (holding && String(input).endsWith('/state')) await held;
        return answer;
      },
    });
    await controller.start();
    await tapAll(controller, [tipOff[1] as TapInput]);
    await controller.idle();
    holding = true;
    const wrong: TapInput = {
      type: 'lineup',
      side: 'home',
      playerIds: [...hawks.slice(0, 4), stranger],
    };
    // On the device the stranger is on the floor; on the server nobody is.
    const wrongAgain = basket('home', stranger);
    await tapAll(controller, [wrong, wrongAgain]);
    // Both refused, the second while the state reloads after the first (its answer
    // held back), so the game shown loses a tap it had when the reload began.
    await expect.poll(() => controller.status().notApplied.length).toBe(2);
    expect(controller.status().reloading).toBe(true);
    await tapAll(controller, [basket('away', bears[2] ?? '')]);
    release();
    await controller.idle();
    const status = controller.status();
    expect(status.reloading).toBe(false);
    expect(scoreOf(status.game)).toEqual({ home: 0, away: 2 });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 2 });
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

  it('does not list as not saved a tap the server took while the takeover was learned', async () => {
    const network = endpointNetwork();
    // The server takes the tablet's next batch, but its answer is held back.
    let holding = false;
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const tablet = device(network, {
      sendTaps: (send) => async (input, init) => {
        const answer = await send(input, init);
        if (holding) await held;
        return answer;
      },
    });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    holding = true;
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    // In the server, not yet answered on the tablet.
    await expect.poll(async () => scoreOf((await serverGame(network)).state).home).toBe(2);

    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();

    // The tablet's renewal learns of the takeover while the batch is still in flight.
    tablet.controller.online();
    await expect.poll(() => tablet.controller.status().mode.kind).toBe('read-only');
    release();
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.notSaved).toEqual([]);
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    expect(await tablet.storage.list(gameId)).toEqual([]);
  });

  it('a passing "not held" that the renewal contradicts is let go again after each good send', async () => {
    const network = endpointNetwork();
    // The next batch is answered "not held" without reaching the server.
    let notHeldOnce = false;
    const tablet = device(network, {
      sendTaps: (send) => async (input, init) => {
        if (!notHeldOnce) return send(input, init);
        notHeldOnce = false;
        const batch = JSON.parse(String(init?.body)) as { commands: { commandId: string }[] };
        const results = batch.commands.map(({ commandId }) => ({
          commandId,
          status: 'refused',
          reason: { code: 'session-not-held', message: '' },
        }));
        return new Response(JSON.stringify({ protocolVersion: 1, sequence: 0, results }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await tablet.controller.start();
    await tablet.controller.idle();
    for (const input of tipOff) {
      notHeldOnce = true;
      await tapAll(tablet.controller, [input]);
      await tablet.controller.idle();
      expect(tablet.controller.status().mode).toEqual({ kind: 'scoring' });
    }
    expect((await serverGame(network)).sequence).toBe(2);
  });

  it('releases a session granted after it left while opening', async () => {
    const network = endpointNetwork();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const tablet = device(network, {
      askServer: (ask) => async (input, init) => {
        const answer = await ask(input, init);
        if (String(init?.body).includes('"open"')) await held;
        return answer;
      },
    });
    const starting = tablet.controller.start();
    await expect.poll(() => network.reached).toContain('POST session:open');
    await tablet.controller.leave();
    release();
    await starting;
    await tablet.controller.idle();
    expect(network.reached).toContain('POST session:release');
    expect(tablet.controller.status().mode.kind).not.toBe('scoring');
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    expect(laptop.controller.status().mode).toEqual({ kind: 'scoring' });
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

describe('tracker controller: signed out mid-game (finding M4)', () => {
  it('keeps taking taps, holds them, and sends each once after signing in again', async () => {
    const network = endpointNetwork();
    let who: Person = 'scorekeeper';
    const tablet = device(network, { signedIn: () => who });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();

    // The sign-in runs out: the next send is turned away.
    who = 'visitor';
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    let status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.signedOut).toBe(true);

    // Still scoring: two more taps are taken and shown, and kept.
    await tapAll(tablet.controller, [
      basket('away', bears[0] ?? '', 3),
      basket('home', hawks[1] ?? ''),
    ]);
    // The renewal is turned away too; scoring goes on.
    await tablet.clock.advance(31_000);
    await tablet.controller.idle();
    status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.signedOut).toBe(true);
    expect(status.notSaved).toEqual([]);
    expect(status.queue.waiting).toBe(3);
    expect(scoreOf(status.game)).toEqual({ home: 4, away: 3 });
    expect((await serverGame(network)).sequence).toBe(2);

    // Signed in again: the next renewal finds it, and the three go, once each.
    who = 'scorekeeper';
    await tablet.clock.advance(31_000);
    await tablet.controller.idle();
    status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.signedOut).toBe(false);
    expect(status.notSaved).toEqual([]);
    expect(status.queue.waiting).toBe(0);
    const server = await serverGame(network);
    expect(server.sequence).toBe(5);
    expect(scoreOf(server.state)).toEqual({ home: 4, away: 3 });
    expect(server.state.plays).toEqual(status.game?.plays);
  });

  it('sends at once when the scorekeeper comes back signed in (openAgain)', async () => {
    const network = endpointNetwork();
    let who: Person = 'scorekeeper';
    const tablet = device(network, { signedIn: () => who });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    who = 'visitor';
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    expect(tablet.controller.status().signedOut).toBe(true);
    // Still signed out: nothing changes.
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    expect(tablet.controller.status()).toMatchObject({
      signedOut: true,
      mode: { kind: 'scoring' },
    });

    who = 'scorekeeper';
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    expect(tablet.controller.status()).toMatchObject({
      signedOut: false,
      mode: { kind: 'scoring' },
    });
    expect(tablet.controller.status().queue.waiting).toBe(0);
    expect((await serverGame(network)).sequence).toBe(3);
  });

  it('signed in as someone else: the taps are not sent under their name, and are listed', async () => {
    const network = endpointNetwork();
    let who: Person = 'scorekeeper';
    const tablet = device(network, { signedIn: () => who });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    who = 'visitor';
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    who = 'owner';
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.mode).toMatchObject({ kind: 'read-only', reason: 'taken-over' });
    expect(status.notSaved.map((c) => c.input)).toEqual([basket('home', hawks[0] ?? '')]);
    expect((await serverGame(network)).sequence).toBe(2);
  });

  it('a reload that is turned away while signed out is tried again once signed in', async () => {
    const network = endpointNetwork();
    let who: Person = 'scorekeeper';
    let stateDown = false;
    const tablet = device(network, {
      signedIn: () => who,
      askServer: (ask) => async (input, init) => {
        if (stateDown && String(input).endsWith('/state')) throw new TypeError('Failed to fetch');
        return ask(input, init);
      },
    });
    await tablet.controller.start();
    await tablet.controller.idle();
    stateDown = true;
    await tapAll(tablet.controller, [
      { type: 'lineup', side: 'home', playerIds: [...hawks.slice(0, 4), stranger] },
    ]);
    await tablet.controller.idle();
    // Refused; the reload gets no answer and waits to try again.
    expect(tablet.controller.status().reloading).toBe(true);
    who = 'visitor';
    stateDown = false;
    await tablet.clock.advance(31_000);
    await tablet.controller.idle();
    expect(tablet.controller.status()).toMatchObject({
      mode: { kind: 'scoring' },
      signedOut: true,
      reloading: true,
    });
    who = 'scorekeeper';
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    expect(tablet.controller.status()).toMatchObject({
      mode: { kind: 'scoring' },
      signedOut: false,
      reloading: false,
    });
  });
});

/** A storage that fails to read while `broken` is true. */
function flakyStorage() {
  const inner = createMemoryQueueStorage();
  const flaky: { broken: boolean; readonly storage: QueueStorage } = {
    broken: false,
    storage: {
      add: (g, e) => inner.add(g, e),
      list: (g) => (flaky.broken ? Promise.reject(new Error('disk gone')) : inner.list(g)),
      settle: (g, s) => inner.settle(g, s),
    },
  };
  return flaky;
}

describe('tracker controller: the device storage fails', () => {
  it('opens read-only when the storage cannot be read, and opens again once it can', async () => {
    const network = endpointNetwork();
    const flaky = flakyStorage();
    flaky.broken = true;
    const { controller } = device(network, { storage: flaky.storage });
    await controller.start();
    await controller.idle();
    expect(controller.status().mode).toEqual({ kind: 'read-only', reason: 'storage-failed' });
    flaky.broken = false;
    await controller.openAgain();
    await controller.idle();
    expect(controller.status().mode).toEqual({ kind: 'scoring' });
  });

  it('taking the game back when the storage fails: read-only, and nothing lost is sent', async () => {
    const network = endpointNetwork();
    const flaky = flakyStorage();
    const tablet = device(network, { storage: flaky.storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    network.mode = 'up';
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toMatchObject({ kind: 'held-by-other' });

    flaky.broken = true;
    expect(await tablet.controller.takeOver()).toEqual({ ok: true });
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({
      kind: 'read-only',
      reason: 'storage-failed',
    });
    flaky.broken = false;
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(tablet.controller.status().notSaved).toHaveLength(1);
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 0 });
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

/** A door held shut until `open` is called. */
function gate() {
  let open = (): void => undefined;
  const shut = new Promise<void>((resolve) => (open = resolve));
  return { shut, open };
}

/** The tablet scores the tip-off, taps `unsent` with no network, and the laptop takes over. */
async function tabletLosesTheGame(
  network: EndpointNetwork,
  unsent: TapInput[],
  storage?: QueueStorage,
) {
  const tablet = device(network, storage === undefined ? {} : { storage });
  await tablet.controller.start();
  await tapAll(tablet.controller, tipOff);
  await tablet.controller.idle();
  network.mode = 'down';
  await tapAll(tablet.controller, unsent);
  network.mode = 'up';
  const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
  await laptop.controller.start();
  await laptop.controller.idle();
  await laptop.controller.takeOver();
  await laptop.controller.idle();
  tablet.controller.online();
  await tablet.controller.idle();
  expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
  return { tablet, laptop };
}

/** Takes the game back on `side` (it was shown read-only), after confirming. */
async function takeBack(side: ReturnType<typeof device>['controller']) {
  await side.openAgain();
  await side.idle();
  expect(side.status().mode).toMatchObject({ kind: 'held-by-other' });
  expect(await side.takeOver()).toEqual({ ok: true });
  await side.idle();
  expect(side.status().mode).toEqual({ kind: 'scoring' });
}

describe('tracker controller: taps not saved are never lost silently (step 2.113)', () => {
  const a = basket('home', hawks[2] ?? '');
  const b = basket('away', bears[3] ?? '', 3);

  it('a reload after taking the game back keeps the not-saved list, and sends none of it', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const { tablet } = await tabletLosesTheGame(network, [a], storage);
    await takeBack(tablet.controller);
    expect(tablet.controller.status().notSaved.map((c) => c.input)).toEqual([a]);
    await tablet.controller.leave();

    const reloaded = device(network, { storage });
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(reloaded.controller.status().notSaved.map((c) => c.input)).toEqual([a]);
    expect(reloaded.controller.status().queue.waiting).toBe(0);
    expect((await serverGame(network)).sequence).toBe(2);
    await reloaded.controller.dismissNotSaved();
    expect(reloaded.controller.status().notSaved).toEqual([]);
    expect(await storage.list(gameId)).toEqual([]);
  });

  it('two losses keep both lists, through a reload too', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const { tablet, laptop } = await tabletLosesTheGame(network, [a], storage);
    await takeBack(tablet.controller);
    network.mode = 'down';
    await tapAll(tablet.controller, [b]);
    network.mode = 'up';
    // The laptop learns it lost the game, and takes it back in its turn.
    laptop.controller.online();
    await laptop.controller.idle();
    await takeBack(laptop.controller);

    tablet.controller.online();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
    expect(tablet.controller.status().notSaved.map((c) => c.input)).toEqual([a, b]);
    await tablet.controller.leave();

    const reloaded = device(network, { storage });
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().mode).toMatchObject({ kind: 'held-by-other' });
    expect(reloaded.controller.status().notSaved.map((c) => c.input)).toEqual([a, b]);
    expect((await serverGame(network)).sequence).toBe(2);
  });

  it('a game ended while the tablet was offline lists its taps as not saved', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tapAll(tablet.controller, [...tipOff, basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, [a, b]);
    network.mode = 'up';

    // Meanwhile the game is ended on another device.
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    await tapAll(laptop.controller, [{ type: 'end' }]);
    await laptop.controller.idle();
    expect((await serverGame(network)).state.status).toBe('final');

    tablet.controller.online();
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'read-only', reason: 'game-not-live' });
    expect(status.notSaved.map((c) => c.input)).toEqual([a, b]);
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    expect(await tablet.controller.tap(a)).toEqual({ ok: false, reason: 'not-scoring' });
    expect(
      (await tablet.storage.list(gameId)).map((entry) => [entry.command.input, entry.state]),
    ).toEqual([
      [a, 'not-saved'],
      [b, 'not-saved'],
    ]);
  });

  it('the queue halted because the game is no longer live: the game is lost, its taps listed', async () => {
    const network = endpointNetwork();
    // The next batch is answered "game not live" without reaching the server.
    let notLive = false;
    const tablet = device(network, {
      sendTaps: (send) => async (input, init) => {
        if (!notLive) return send(input, init);
        const batch = JSON.parse(String(init?.body)) as { commands: { commandId: string }[] };
        const results = batch.commands.map(({ commandId }) => ({
          commandId,
          status: 'refused',
          reason: { code: 'game-not-live', message: '' },
        }));
        return new Response(JSON.stringify({ protocolVersion: 1, sequence: 2, results }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    notLive = true;
    await tapAll(tablet.controller, [a]);
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'read-only', reason: 'game-not-live' });
    expect(status.notSaved.map((c) => c.input)).toEqual([a]);
    // The server's state is shown: the tap is not.
    expect(scoreOf(status.game)).toEqual({ home: 0, away: 0 });
  });

  it('a tap stored while the game was being lost is listed as not saved, not shown', async () => {
    const network = endpointNetwork();
    const inner = createMemoryQueueStorage();
    let adding: ReturnType<typeof gate> | null = null;
    const storage: QueueStorage = {
      add: async (g, e) => {
        if (adding !== null) await adding.shut;
        return inner.add(g, e);
      },
      list: (g) => inner.list(g),
      settle: (g, s) => inner.settle(g, s),
    };
    const tablet = device(network, { storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();

    // The tap is being stored when the tablet learns of the takeover.
    adding = gate();
    const statesBefore = network.reached.filter((r) => r === 'GET state').length;
    const tapping = tablet.controller.tap(a);
    tablet.controller.online();
    await expect.poll(() => tablet.controller.status().mode.kind).toBe('read-only');
    // The server's state is asked for again as the game is lost.
    await expect
      .poll(() => network.reached.filter((r) => r === 'GET state').length)
      .toBe(statesBefore + 1);
    adding.open();
    expect(await tapping).toEqual({ ok: false, reason: 'not-scoring' });
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.notSaved.map((c) => c.input)).toEqual([a]);
    expect(scoreOf(status.game)).toEqual({ home: 0, away: 0 });
    expect((await inner.list(gameId)).map((entry) => entry.state)).toEqual(['not-saved']);

    // Taking the game back never sends it.
    await takeBack(tablet.controller);
    await tablet.controller.idle();
    expect((await serverGame(network)).sequence).toBe(2);
    expect(tablet.controller.status().notSaved.map((c) => c.input)).toEqual([a]);
  });

  it('a takeover that goes unanswered loads the server’s state again', async () => {
    const network = endpointNetwork();
    let stateGate: ReturnType<typeof gate> | null = null;
    let statesAsked = 0;
    let takeOverGate: ReturnType<typeof gate> | null = null;
    const tablet = device(network, {
      askServer: (ask) => async (input, init) => {
        if (String(input).endsWith('/state')) {
          statesAsked += 1;
          const held = stateGate;
          const answer = await ask(input, init);
          if (held !== null) await held.shut;
          return answer;
        }
        if (takeOverGate !== null && String(init?.body).includes('"take-over"')) {
          await takeOverGate.shut;
          throw new TypeError('Failed to fetch');
        }
        return ask(input, init);
      },
    });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    // The laptop scores after the tablet last saw the server's state.
    await tapAll(laptop.controller, [basket('home', hawks[0] ?? '')]);
    await laptop.controller.idle();

    // Shown the holder, the tablet's state reload is held up; the takeover begins.
    stateGate = gate();
    const asked = statesAsked;
    const opening = tablet.controller.openAgain();
    await expect.poll(() => statesAsked).toBe(asked + 1);
    expect(tablet.controller.status().mode).toMatchObject({ kind: 'held-by-other' });
    takeOverGate = gate();
    const taking = tablet.controller.takeOver();
    const held = stateGate;
    stateGate = null;
    held.open();
    await opening;
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 0, away: 0 });
    takeOverGate.open();
    expect(await taking).toEqual({ ok: false, reason: 'unanswered' });
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toMatchObject({ kind: 'held-by-other' });
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 0 });
  });
});

describe('tracker controller: which taps wait, and the last save (finding L1)', () => {
  it('names each waiting tap, the plays still to save, and when the last one was saved', async () => {
    const network = endpointNetwork();
    const { controller, clock } = device(network);
    await controller.start();
    await tapAll(controller, tipOff);
    await controller.idle();
    const firstSave = controller.status().lastSavedAt ?? 0;
    // On the server's clock (the stand-in's is the real one): within a second of now.
    expect(Math.abs(firstSave - controller.status().now())).toBeLessThan(1_000);

    network.mode = 'down';
    const offline = [basket('home', hawks[0] ?? ''), basket('away', bears[1] ?? '', 3)];
    await tapAll(controller, offline);
    let status = controller.status();
    expect(status.waiting.map((c) => c.input)).toEqual(offline);
    const unsaved = new Set(status.waiting.map((c) => c.commandId));
    const plays = status.game?.plays ?? [];
    expect(plays.filter((p) => unsaved.has(p.id)).map((p) => p.type)).toEqual(['score', 'score']);
    expect(plays.filter((p) => !unsaved.has(p.id)).map((p) => p.type)).toEqual([
      'lineup',
      'lineup',
    ]);
    await clock.advance(5 * minute);
    expect(controller.status().lastSavedAt).toBe(firstSave);

    network.mode = 'up';
    controller.online();
    await controller.idle();
    status = controller.status();
    expect(status.waiting).toEqual([]);
    const lastSave = status.lastSavedAt ?? 0;
    expect(Math.abs(lastSave - status.now())).toBeLessThan(1_000);
    // The device's five minutes offline are not the server's: only its own clock counts.
    expect(lastSave).toBeGreaterThanOrEqual(firstSave);
  });
});

/**
 * A server whose clock is `aheadMs` ahead of the device's, answering a session request
 * `up` ms after it is sent (when it stamps its time) and `down` ms after that.
 */
function timedServer(clock: ManualClock, aheadMs: number) {
  const legs = { up: 100, down: 100 };
  const sessionId = '01900000-0000-7000-8000-0000000000c1';
  const server: TrackerServer = {
    session: () =>
      new Promise((resolve) => {
        const up = legs.up;
        const down = legs.down;
        clock.after(up, () => {
          const sentAt = clock.now() + aheadMs;
          const value = {
            status: 'held-by-you' as const,
            sessionId,
            expiresAt: sentAt + 120_000,
            sentAt,
          };
          clock.after(down, () => resolve({ kind: 'answer', value } as const));
        });
      }),
    loadState: async () => ({
      kind: 'answer',
      value: { sequence: 0, state: basketball.newGame() },
    }),
  };
  return { legs, server };
}

/** Moves the clock on a little at a time until `work` is done (its timers set late). */
async function until(clock: ManualClock, work: Promise<unknown>) {
  let done = false;
  void work.finally(() => (done = true)).catch(() => undefined);
  for (let step = 0; step < 500 && !done; step += 1) await clock.advance(100);
  await work;
}

describe('tracker controller: the server’s time (finding M1)', () => {
  it('with the device 30 seconds slow, now() gives the server’s time within the measured error', async () => {
    const clock = createManualClock();
    const ahead = 30_000;
    const { legs, server } = timedServer(clock, ahead);
    const queueServer = createFakeServer(clock);
    const controller = createTrackerController({
      gameId,
      deviceId: 'tablet-1',
      storage: createMemoryQueueStorage(),
      transport: queueServer.transport,
      server,
      clock,
      newCommandId,
      random: () => 1,
    });
    const serverTime = () => clock.now() + ahead;
    expect(controller.status().clockErrorMs).toBeNull();

    // Up quickly, back slowly: the midpoint is off, by less than half the round trip.
    legs.up = 50;
    legs.down = 350;
    await until(clock, controller.start());
    await until(clock, controller.idle());
    let status = controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.clockErrorMs).toBe(200);
    expect(Math.abs(status.now() - serverTime())).toBeLessThanOrEqual(200);
    expect(Math.abs(status.now() - serverTime())).toBeGreaterThan(0);

    // A tap is timed by the server's clock, not the device's.
    await tapAll(controller, tipOff);
    expect(
      Math.abs((queueServer.received[0]?.commands[0]?.at ?? 0) - serverTime()),
    ).toBeLessThanOrEqual(200);

    // A slow, lopsided reply is not trusted over the closer one.
    const before = status.now() - clock.now();
    legs.up = 100;
    legs.down = 9_000;
    controller.online();
    await until(clock, controller.idle());
    status = controller.status();
    expect(status.now() - clock.now()).toBe(before);
    expect(status.clockErrorMs).toBe(200);

    // An even, quick one is: the error shrinks with it.
    legs.up = 20;
    legs.down = 20;
    controller.online();
    await until(clock, controller.idle());
    status = controller.status();
    expect(status.clockErrorMs).toBe(20);
    expect(status.now()).toBe(serverTime());
    await until(clock, controller.leave());
  });
});
