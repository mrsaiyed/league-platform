// The tracker's controller against the real endpoints (step 2.34's done test): the
// browser's transports reach the commands, session and state handlers in this process,
// over the web app's made-up stand-in. Tapping offline, reconnecting, a tab closed with
// taps waiting, a refusal (T-113) and a takeover (T6 §5).
import { TrackerGameState } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
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
import type { DeviceScoring } from './opened-game-storage.ts';
import type { KeptTap, QueueStorage } from './queue-storage.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import {
  createFakeServer,
  createManualClock,
  flush,
  type ManualClock,
} from './tracker-queue.test-helper.ts';
import type { ServerState, TrackerServer } from './tracker-server.ts';

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
    kept,
    keepScoring,
  }: {
    /** What the device kept of the game, as a page reloaded finds it (step 2.38). */
    kept?: { readonly state: ServerState | null; readonly scoring: DeviceScoring | null };
    keepScoring?: (scoring: DeviceScoring) => Promise<void>;
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
    // The device never sleeps here: its wall clock keeps pace with its steady clock.
    wallClock: clock.now,
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
    ...(kept === undefined ? {} : { kept }),
    ...(keepScoring === undefined ? {} : { keepScoring }),
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

/** The tap of a listed play, as the screen made it. */
const inputOf = (kept: KeptTap) => kept.command.input;

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
    // Several minutes with no answer and plays waiting: said plainly (T6 §4), not before.
    await clock.advance(4 * minute);
    expect(controller.status().offlineLong).toBe(false);
    await clock.advance(1.5 * minute);
    expect(controller.status().offlineLong).toBe(true);
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
    expect(controller.status().offlineLong).toBe(false);
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

  /**
   * Step 2.38's fault: a page reloaded with no signal, its session ended meanwhile (the
   * leaving page's release reached the server, say), was given a new session on opening
   * before its waiting taps were sent, and listed them as not saved though nobody took
   * the game. The same device and account carry on; only somebody else's taking the
   * game lists them.
   */
  async function reloadedAway(meanwhile: 'lapsed' | 'released' | 'taken' | 'scored-and-left') {
    const serverClock = createManualClock(1_900_000_000_000);
    const onTheServer = vi.spyOn(Date, 'now').mockImplementation(() => serverClock.now());
    onTestFinished(() => onTheServer.mockRestore());
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    let keptScoring: DeviceScoring | null = null;
    const first = device(network, {
      storage,
      keepScoring: (scoring) => {
        keptScoring = scoring;
        return Promise.resolve();
      },
    });
    await first.controller.start();
    await tapAll(first.controller, tipOff);
    await first.controller.idle();
    // What the page kept on the device: the server's state as it last loaded it.
    const keptState: ServerState = await serverGame(network);
    network.mode = 'down';
    await tapAll(first.controller, [basket('home', hawks[0] ?? '')]);
    await first.controller.leave();
    network.mode = 'up';
    const kept = keptScoring as DeviceScoring | null;
    if (kept === null) throw new Error('nothing kept');
    // Away longer than the lease, on the server's clock.
    await serverClock.advance(5 * minute);
    if (meanwhile === 'released') {
      const asTablet = createFetchTrackerServer({
        leagueId: liveLeagueId,
        gameId,
        fetch: network.fetchAs('scorekeeper'),
      });
      const released = await asTablet.session(
        { type: 'release', sessionId: kept.sessionId },
        new AbortController().signal,
      );
      expect(released.kind).toBe('answer');
    }
    if (meanwhile === 'taken' || meanwhile === 'scored-and-left') {
      const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
      await laptop.controller.start();
      await laptop.controller.idle();
      expect(laptop.controller.status().mode).toEqual({ kind: 'scoring' });
      if (meanwhile === 'scored-and-left') {
        await tapAll(laptop.controller, [basket('away', bears[0] ?? '', 3)]);
        await laptop.controller.idle();
        await laptop.controller.leave();
        await laptop.controller.idle();
      }
    }
    // The page reloads: the server answers opening before any tap is sent.
    const second = device(network, { storage, kept: { state: keptState, scoring: kept } });
    await second.controller.start();
    await second.controller.idle();
    return { network, second, status: second.controller.status() };
  }

  it.each(['lapsed', 'released'] as const)(
    'carries on after a reload when its session %s and nobody else scored',
    async (meanwhile) => {
      const { network, status } = await reloadedAway(meanwhile);
      expect(status.notSaved).toEqual([]);
      expect(status.queue.waiting).toBe(0);
      expect(status.mode).toEqual({ kind: 'scoring' });
      expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
      expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 0 });
      // Sent once: the server took it once.
      expect((await serverGame(network)).sequence).toBe(3);
    },
  );

  it('lists the waiting taps as not saved when somebody else holds the game', async () => {
    const { network, status } = await reloadedAway('taken');
    expect(status.notSaved.map((t) => t.command.input)).toEqual([basket('home', hawks[0] ?? '')]);
    expect(status.queue.waiting).toBe(0);
    expect(status.mode.kind).toBe('held-by-other');
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 0 });
  });

  it('lists them as not saved when somebody else scored and let the game go', async () => {
    const { network, status } = await reloadedAway('scored-and-left');
    expect(status.notSaved.map((t) => t.command.input)).toEqual([basket('home', hawks[0] ?? '')]);
    expect(status.queue.waiting).toBe(0);
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 3 });
  });

  /**
   * Step 2.38, part 6: a tap saved, then the page reloaded with no signal before the next
   * load; the leaving page's release reached the server. Reopened from what the device
   * kept, two taps more, and the network back.
   */
  async function reloadedRightAfterATap(
    stateKept: 'before-the-tap' | 'with-it' = 'before-the-tap',
    askServer?: (ask: typeof globalThis.fetch) => typeof globalThis.fetch,
  ) {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    let keptScoring: DeviceScoring | null = null;
    const first = device(network, {
      storage,
      keepScoring: (scoring) => {
        keptScoring = scoring;
        return Promise.resolve();
      },
    });
    await first.controller.start();
    await tapAll(first.controller, tipOff);
    await first.controller.idle();
    // What the device kept of the server's state: its last load, before the tap.
    let keptState: ServerState = await serverGame(network);
    await tapAll(first.controller, [basket('home', hawks[0] ?? '')]);
    // The reload comes before the load that follows the tap's saving is kept: the
    // scoring kept is the one as of the tap (the state too, or the load's, with it).
    const kept = keptScoring as DeviceScoring | null;
    await first.controller.idle();
    expect(first.controller.status().queue.waiting).toBe(0);
    if (stateKept === 'with-it') keptState = await serverGame(network);
    await first.controller.leave();
    expect(network.reached).toContain('POST session:release');
    if (kept === null) throw new Error('nothing kept');
    network.mode = 'down';
    const second = device(network, {
      storage,
      kept: { state: keptState, scoring: kept },
      ...(askServer === undefined ? {} : { askServer }),
    });
    await second.controller.start();
    return { network, second };
  }

  it('keeps each tap on the device at once: reopened with no signal, the score has it', async () => {
    const { second } = await reloadedRightAfterATap();
    expect(second.controller.status().mode).toEqual({ kind: 'scoring' });
    // Without it: 0-0, the kept state being older than the tap (fault c).
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 2, away: 0 });
    // A kept state that has the tap already counts it once.
    const withIt = await reloadedRightAfterATap('with-it');
    expect(scoreOf(withIt.second.controller.status().game)).toEqual({ home: 2, away: 0 });
  });

  /**
   * Step 2.61, seed 66: reloaded with no signal, scoring from the kept state with a tap
   * waiting on top (2-0, then 4-0). The bad Wi-Fi browser test cannot replay this order
   * (its timing varies): these cases are the fixed guard of the fix (T-329).
   */
  async function reloadedWithNoSignal() {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const keptBy: DeviceScoring[] = [];
    const keepScoring = (scoring: DeviceScoring) => {
      keptBy.push(scoring);
      return Promise.resolve();
    };
    const first = device(network, { storage, keepScoring });
    await first.controller.start();
    await tapAll(first.controller, tipOff);
    await first.controller.idle();
    const keptState: ServerState = await serverGame(network);
    network.mode = 'down';
    await tapAll(first.controller, [basket('home', hawks[0] ?? '')]);
    await first.controller.leave();
    const reloaded = (keptBy.at(-1) ?? null) as DeviceScoring | null;
    // The state is never answered while the signal is back: opening is, and holds.
    let stateAsks = 0;
    const second = device(network, {
      storage,
      keepScoring,
      kept: { state: keptState, scoring: reloaded },
      askServer: (ask) => (input, init) => {
        if (!String(input instanceof Request ? input.url : input).endsWith('/state'))
          return ask(input, init);
        stateAsks += network.mode === 'up' ? 1 : 0;
        return Promise.reject(new TypeError('Failed to fetch'));
      },
    });
    await second.controller.start();
    await tapAll(second.controller, [basket('home', hawks[1] ?? '')]);
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 4, away: 0 });
    /** The signal back for a moment: the queue sends, opening is answered, no state. */
    const signalBack = async (total: number, opening: boolean) => {
      // Its send with no signal answered (not) first, so the return sends at once.
      await second.controller.idle();
      const from = network.reached.length;
      const asked = stateAsks;
      network.mode = 'up';
      second.controller.online();
      await second.controller.idle();
      const reached = network.reached.slice(from);
      expect(reached).toContain('POST commands');
      // The first time, opening was answered and the state after it asked (and lost):
      // `hold` ran. The second time the session is held already: it is renewed.
      if (opening) expect(reached).toContain('POST session:open');
      if (opening) expect(stateAsks).toBeGreaterThan(asked);
      expect(second.controller.status().queue.waiting).toBe(0);
      expect(scoreOf((await serverGame(network)).state)).toEqual({ home: total, away: 0 });
      network.mode = 'down';
    };
    /** The tab opened again with no signal, then the signal back for good. */
    const openedAgain = async (total: number) => {
      await second.controller.leave();
      const third = device(network, {
        storage,
        kept: { state: keptState, scoring: (keptBy.at(-1) ?? null) as DeviceScoring | null },
      });
      await third.controller.start();
      // Without the fix: 2-0, the taps the server took gone from the kept scoring.
      expect(scoreOf(third.controller.status().game)).toEqual({ home: total, away: 0 });
      network.mode = 'up';
      third.controller.online();
      await third.controller.idle();
      // Once the server's state is loaded, each tap counts once.
      expect(third.controller.status().mode).toEqual({ kind: 'scoring' });
      expect(scoreOf(third.controller.status().game)).toEqual({ home: total, away: 0 });
      expect(scoreOf((await serverGame(network)).state)).toEqual({ home: total, away: 0 });
    };
    return { second, signalBack, openedAgain };
  }

  it('keeps the taps the server took on opening in the kept scoring until the state after them is kept (T-329)', async () => {
    // The signal back for a moment, gone before the state is; one tap more; the tab
    // opened again with no signal.
    const { second, signalBack, openedAgain } = await reloadedWithNoSignal();
    await signalBack(4, true);
    await tapAll(second.controller, [basket('home', hawks[2] ?? '')]);
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 6, away: 0 });
    await openedAgain(6);
  });

  it('keeps them when the signal comes back twice before the state is loaded (T-329)', async () => {
    const { second, signalBack, openedAgain } = await reloadedWithNoSignal();
    await signalBack(4, true);
    await tapAll(second.controller, [basket('home', hawks[2] ?? '')]);
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 6, away: 0 });
    await signalBack(6, false);
    await tapAll(second.controller, [basket('home', hawks[3] ?? '')]);
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 8, away: 0 });
    await openedAgain(8);
  });

  it('sends the taps made since under the new session, though a send under the ended one was refused first', async () => {
    const { network, second } = await reloadedRightAfterATap();
    await tapAll(second.controller, [
      basket('home', hawks[1] ?? ''),
      basket('away', bears[0] ?? '', 3),
    ]);
    network.mode = 'up';
    // The queue sends under the kept session, which the release ended: refused. Opening
    // gives this device a new session; nobody else scored, so the taps carry on (fault a).
    second.controller.online();
    await second.controller.idle();
    const status = second.controller.status();
    expect(status.notSaved).toEqual([]);
    expect(status.queue.waiting).toBe(0);
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 4, away: 3 });
  });

  /** The address a request went to. */
  const addressOf = (input: Parameters<typeof globalThis.fetch>[0]) =>
    input instanceof Request ? input.url : String(input);

  /**
   * Step 2.61, seed 2024 (T-331): the tab opened again with no signal, the signal back, a
   * send not answered, and a tap stored while opening is settled. `hold` rebuilt the game
   * from the storage, which held the tap already, and the tap then laid itself on top a
   * second time: shown and kept twice (6-0), sent once (4-0), until the next load.
   */
  it('counts a tap stored while opening is settled once: shown, kept and sent once (T-331)', async () => {
    const network = endpointNetwork();
    const inner = createMemoryQueueStorage();
    /** Runs once, right after the next tap is stored and before it is shown. */
    let onceStored: (() => Promise<void>) | null = null;
    /** Resolves once the next read of the storage is answered. */
    let listed: (() => void) | null = null;
    const storage: QueueStorage = {
      ...inner,
      add: async (game, entry) => {
        const added = await inner.add(game, entry);
        const then = onceStored;
        onceStored = null;
        if (then !== null) await then();
        return added;
      },
      list: async (game) => {
        const list = await inner.list(game);
        const then = listed;
        listed = null;
        then?.();
        return list;
      },
    };
    const keptBy: DeviceScoring[] = [];
    const keepScoring = (scoring: DeviceScoring) => {
      keptBy.push(scoring);
      return Promise.resolve();
    };
    const first = device(network, { storage, keepScoring });
    await first.controller.start();
    await tapAll(first.controller, tipOff);
    await first.controller.idle();
    const keptState: ServerState = await serverGame(network);
    network.mode = 'down';
    await tapAll(first.controller, [basket('home', hawks[0] ?? '')]);
    // Closed with no signal: the release never reached the server; the session holds.
    await first.controller.leave();
    let sendsLost = false;
    let opened = (): void => undefined;
    let openHeld: Promise<void> | null = null;
    const second = device(network, {
      storage,
      keepScoring,
      kept: { state: keptState, scoring: (keptBy.at(-1) ?? null) as DeviceScoring | null },
      sendTaps: (send) => (input, init) =>
        sendsLost ? Promise.reject(new TypeError('Failed to fetch')) : send(input, init),
      askServer: (ask) => async (input, init) => {
        const answer = await ask(input, init);
        if (openHeld !== null && !addressOf(input).endsWith('/state')) await openHeld;
        return answer;
      },
    });
    await second.controller.start();
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 2, away: 0 });
    // The signal back: the queue's send is not answered, opening's answer is on its way.
    sendsLost = true;
    openHeld = new Promise((resolve) => (opened = resolve));
    const from = network.reached.length;
    network.mode = 'up';
    second.controller.online();
    await vi.waitFor(() => expect(network.reached.slice(from)).toContain('POST session:open'), {
      timeout: 2000,
    });
    // The next tap is stored; opening is answered, and settled once the storage is read.
    onceStored = async () => {
      const read = new Promise<void>((resolve) => (listed = resolve));
      openHeld = null;
      opened();
      await read;
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    await tapAll(second.controller, [basket('home', hawks[1] ?? '')]);
    await second.controller.idle();
    // Without the fix: 6-0 on the screen and the tap twice in the kept scoring.
    expect(scoreOf(second.controller.status().game)).toEqual({ home: 4, away: 0 });
    const onTop = (keptBy.at(-1)?.onTop ?? []).map((c) => c.commandId);
    expect(new Set(onTop).size).toBe(onTop.length);
    sendsLost = false;
    second.controller.online();
    await second.controller.idle();
    const status = second.controller.status();
    expect(status.queue.waiting).toBe(0);
    expect(status.notSaved).toEqual([]);
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(scoreOf(status.game)).toEqual({ home: 4, away: 0 });
    // Sent once: tip-off, the tap before the reload and this one.
    const onServer = await serverGame(network);
    expect(scoreOf(onServer.state)).toEqual({ home: 4, away: 0 });
    expect(onServer.sequence).toBe(4);
  });

  /**
   * Step 2.61, seed 5 with the no-signal steps given signal (T-331): the release reached
   * the server, so opening gives a new session and `hold` asks the state to judge the
   * ended session's taps. A tap made meanwhile was made under the ended one; the game was
   * rebuilt from the storage read before it: gone from the screen and never sent.
   */
  it('sends a tap made while the ended session’s taps are judged, and shows it (T-331)', async () => {
    let stateHeld: Promise<void> | null = null;
    let answered = (): void => undefined;
    const { network, second } = await reloadedRightAfterATap(
      'before-the-tap',
      (ask) => async (input, init) => {
        const answer = await ask(input, init);
        if (stateHeld !== null && addressOf(input).endsWith('/state')) await stateHeld;
        return answer;
      },
    );
    await tapAll(second.controller, [basket('home', hawks[1] ?? '')]);
    // Its send with no signal answered (not) first, so the return sends at once.
    await second.controller.idle();
    stateHeld = new Promise((resolve) => (answered = resolve));
    const from = network.reached.length;
    network.mode = 'up';
    second.controller.online();
    await vi.waitFor(() => expect(network.reached.slice(from)).toContain('GET state'), {
      timeout: 2000,
    });
    await tapAll(second.controller, [basket('away', bears[0] ?? '', 3)]);
    stateHeld = null;
    answered();
    await second.controller.idle();
    const status = second.controller.status();
    // Without the fix: 4-0 shown, the three points waiting under the ended session.
    expect(status.notSaved).toEqual([]);
    expect(status.queue.waiting).toBe(0);
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(scoreOf(status.game)).toEqual({ home: 4, away: 3 });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 4, away: 3 });
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
    // Loaded on opening, and again after the refusal; and, while the game had not
    // started, after each batch the server took (the line-up, then the basket), since
    // until then the server plays it under its rules as they stand (record 062). Four
    // only because the wrong line-up and the basket go in separate batches here: in one
    // batch, the refusal's reload would be the only load after it.
    expect(network.reached.filter((r) => r === 'GET state')).toHaveLength(4);
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
    expect(status.notSaved.map(inputOf)).toEqual([
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

  it('a kept play entered again whose taking off the list fails is never recorded twice, and says so (review M1)', async () => {
    const network = endpointNetwork();
    const memory = createMemoryQueueStorage();
    let failRemoving: string | null = null;
    const storage: QueueStorage = {
      ...memory,
      add: (...args) => memory.add(...args),
      list: (...args) => memory.list(...args),
      settle: (game, settlement) =>
        failRemoving !== null && (settlement.remove ?? []).includes(failRemoving)
          ? Promise.reject(new Error('storage full'))
          : memory.settle(game, settlement),
    };
    const tablet = device(network, { storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, [...tipOff]);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, [basket('home', hawks[2] ?? '')]);
    network.mode = 'up';
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    await laptop.controller.leave();
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    if (tablet.controller.status().mode.kind === 'held-by-other') {
      await tablet.controller.takeOver();
      await tablet.controller.idle();
    }
    const keptId = tablet.controller.status().notSaved[0]?.command.commandId ?? '';
    expect(keptId).not.toBe('');
    failRemoving = keptId;
    // Entered, but still on the list: the scorekeeper is told something failed.
    expect((await tablet.controller.enterAgain(keptId)).ok).toBe(false);
    expect(tablet.controller.status().notSaved).toHaveLength(1);
    await tablet.controller.idle();
    // A second tap does not record it again.
    expect((await tablet.controller.enterAgain(keptId)).ok).toBe(false);
    await tablet.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 0 });
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 0 });
    // Once the storage works, the next tap only takes it off the list.
    failRemoving = null;
    expect((await tablet.controller.enterAgain(keptId)).ok).toBe(true);
    await tablet.controller.idle();
    expect(tablet.controller.status().notSaved).toEqual([]);
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 0 });
  });

  it('enters a kept play again only once it holds the game again, as a new play (S-77)', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tapAll(tablet.controller, [...tipOff]);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, [
      basket('home', hawks[2] ?? ''),
      basket('away', bears[0] ?? '', 3),
    ]);
    network.mode = 'up';
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    const [first, second] = tablet.controller.status().notSaved;
    const firstId = first?.command.commandId ?? '';

    // Not holding the game, the list is for reading out: nothing is entered.
    expect(await tablet.controller.enterAgain(firstId)).toEqual({
      ok: false,
      reason: 'not-scoring',
    });
    expect(tablet.controller.status().notSaved).toHaveLength(2);

    // The laptop lets go; the tablet takes the game back and enters one of them again.
    await laptop.controller.leave();
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    if (tablet.controller.status().mode.kind === 'held-by-other') {
      await tablet.controller.takeOver();
      await tablet.controller.idle();
    }
    expect(tablet.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(await tablet.controller.enterAgain('no-such-play')).toEqual({
      ok: false,
      reason: 'not-kept',
    });
    const again = await tablet.controller.enterAgain(firstId);
    expect(again.ok).toBe(true);
    // A new play, with an id of its own; it leaves the list, the other stays.
    expect(again.ok && again.commandId !== firstId).toBe(true);
    expect(tablet.controller.status().notSaved.map((t) => t.command.commandId)).toEqual([
      second?.command.commandId,
    ]);
    await tablet.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 0 });
    expect((await tablet.storage.list(gameId)).map((t) => t.command.commandId)).toEqual([
      second?.command.commandId,
    ]);

    // Undo takes it back as it takes back any tap.
    await tapAll(tablet.controller, [{ type: 'undo' }]);
    await tablet.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 0 });
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

  it('hidden, it stops checking its hold; shown again it checks at once and learns of a takeover (T-295)', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tablet.controller.idle();
    tablet.controller.hidden();
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    // Ten minutes hidden: no check, so nothing is learnt.
    await tablet.clock.advance(600_000);
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'scoring' });
    tablet.controller.awake();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
  });

  it('shown again after a sleep with nobody else in, it carries on holding the game (T-295)', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tablet.controller.idle();
    tablet.controller.hidden();
    await tablet.clock.advance(600_000);
    tablet.controller.awake();
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
    expect(reloaded.controller.status().notSaved.map(inputOf)).toEqual([
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
    // Not "another device took over" (finding L5): its own reason, and its own words.
    expect(status.mode).toMatchObject({ kind: 'read-only', reason: 'signed-in-as-other' });
    expect(status.notSaved.map(inputOf)).toEqual([basket('home', hawks[0] ?? '')]);
    expect((await serverGame(network)).sequence).toBe(2);
  });

  it('a real takeover while signed in is still a takeover', async () => {
    const { tablet } = await tabletLosesTheGame(endpointNetwork(), [
      basket('home', hawks[0] ?? ''),
    ]);
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
  });

  it("no longer allowed to score mid-game (the server's own 403): the taps stay on the device, and go once allowed again", async () => {
    const network = endpointNetwork();
    let who: Person = 'scorekeeper';
    const tablet = device(network, { signedIn: () => who });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    // The person may no longer score the game: the next send is refused as not allowed.
    who = 'coach';
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    let status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'read-only', reason: 'not-allowed' });
    expect(status.notSaved).toEqual([]);
    expect(status.waiting.map(inputOf)).toEqual([basket('home', hawks[0] ?? '')]);
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    // Allowed again, the game is opened again here: the tap goes, once.
    who = 'scorekeeper';
    await tablet.controller.openAgain();
    await tablet.controller.idle();
    status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.waiting).toEqual([]);
    const server = await serverGame(network);
    expect(server.sequence).toBe(3);
    expect(scoreOf(server.state)).toEqual({ home: 2, away: 0 });
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

/** A page from something between the device and the server: a filter, a host's error page. */
const pageInBetween = (status: number) => () =>
  Promise.resolve(
    new Response('<html><body>Blocked by the network</body></html>', {
      status,
      headers: { 'content-type': 'text/html' },
    }),
  );

describe('tracker controller: an answer that is not the server’s is no answer (finding G)', () => {
  for (const httpStatus of [404, 403, 401, 400]) {
    it(`a ${httpStatus} page in between while taps wait: nothing is lost, refused or set aside`, async () => {
      const network = endpointNetwork();
      let between = false;
      const tablet = device(network, {
        sendTaps: (send) => (input, init) =>
          between ? pageInBetween(httpStatus)() : send(input, init),
        askServer: (ask) => (input, init) =>
          between ? pageInBetween(httpStatus)() : ask(input, init),
      });
      await tablet.controller.start();
      await tapAll(tablet.controller, tipOff);
      await tablet.controller.idle();
      between = true;
      const waiting = [
        basket('home', hawks[0] ?? ''),
        basket('home', hawks[1] ?? '', 3),
        basket('away', bears[0] ?? ''),
      ];
      await tapAll(tablet.controller, waiting);
      await tablet.controller.idle();
      // The renewal meets the page too.
      await tablet.clock.advance(31_000);
      await tablet.controller.idle();
      let status = tablet.controller.status();
      expect(status.mode).toEqual({ kind: 'scoring' });
      expect(status).toMatchObject({ signedOut: false, notSaved: [], notApplied: [] });
      expect(status.waiting.map(inputOf)).toEqual(waiting);
      expect(scoreOf(status.game)).toEqual({ home: 5, away: 2 });
      expect(status.queue.unansweredSince).not.toBeNull();
      expect((await tablet.storage.list(gameId)).map((e) => e.state)).toEqual([
        'waiting',
        'waiting',
        'waiting',
      ]);

      // The network is honest again: every tap goes, once.
      between = false;
      tablet.controller.online();
      await tablet.controller.idle();
      status = tablet.controller.status();
      expect(status.mode).toEqual({ kind: 'scoring' });
      expect(status.waiting).toEqual([]);
      const server = await serverGame(network);
      expect(server.sequence).toBe(5);
      expect(scoreOf(server.state)).toEqual({ home: 5, away: 2 });
    });
  }

  it('a 404 page in between while opening: it keeps trying, and opens once the server answers', async () => {
    const network = endpointNetwork();
    let between = true;
    const { controller, clock } = device(network, {
      askServer: (ask) => (input, init) => (between ? pageInBetween(404)() : ask(input, init)),
    });
    await controller.start();
    await clock.advance(minute);
    expect(controller.status().mode).toEqual({ kind: 'opening' });
    between = false;
    controller.online();
    await controller.idle();
    expect(controller.status().mode).toEqual({ kind: 'scoring' });
  });

  it("the server's own refusal is still its word: a game it no longer has is lost", async () => {
    const network = endpointNetwork();
    let gone = false;
    const tablet = device(network, {
      sendTaps: (send) => (input, init) =>
        gone
          ? Promise.resolve(
              new Response(JSON.stringify({ error: 'not-found' }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
              }),
            )
          : send(input, init),
    });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    gone = true;
    await tapAll(tablet.controller, [basket('home', hawks[0] ?? '')]);
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'unknown-game' });
    expect(tablet.controller.status().notSaved).toHaveLength(1);
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
      // A game that is over is loaded, to show its final panel (step 2.37, part 2).
      expect(controller.status().game !== null).toBe(reason === 'game-not-live');
    }
    // Nothing is sent, and only the game that is over is read, once.
    expect(network.reached.filter((r) => r.endsWith('commands') || r.endsWith('state'))).toEqual([
      'GET state',
    ]);
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
    expect(tablet.controller.status().notSaved.map(inputOf)).toEqual([a]);
    await tablet.controller.leave();

    const reloaded = device(network, { storage });
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(reloaded.controller.status().notSaved.map(inputOf)).toEqual([a]);
    expect(reloaded.controller.status().queue.waiting).toBe(0);
    expect((await serverGame(network)).sequence).toBe(2);
    await reloaded.controller.dismissNotSaved();
    expect(reloaded.controller.status().notSaved).toEqual([]);
    expect(await storage.list(gameId)).toEqual([]);
  });

  it('keeps the period and game clock of each tap not saved, after the game is rebuilt without it (finding I)', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const q2 = { type: 'period', period: 2 } as const;
    const sixThirty = { type: 'set-clock', ms: 390_000 } as const;
    const { tablet } = await tabletLosesTheGame(network, [q2, sixThirty, a], storage);
    const status = tablet.controller.status();
    // The made-up league plays two halves of twenty minutes.
    expect(status.notSaved).toEqual([
      expect.objectContaining({ moment: { period: 1, clockMs: 1_200_000 } }),
      expect.objectContaining({ moment: { period: 2, clockMs: 1_200_000 } }),
      { command: expect.objectContaining({ input: a }), moment: { period: 2, clockMs: 390_000 } },
    ]);
    // The game shown is the server's: still the first period, and no such basket in it.
    expect(basketball.derive(status.game ?? basketball.newGame()).period).toBe(1);
    expect(scoreOf(status.game)).toEqual({ home: 0, away: 0 });
    // And so is what a reload reads back.
    await tablet.controller.leave();
    const reloaded = device(network, { storage });
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().notSaved.map((t) => t.moment)).toEqual([
      { period: 1, clockMs: 1_200_000 },
      { period: 2, clockMs: 1_200_000 },
      { period: 2, clockMs: 390_000 },
    ]);
  });

  it('names where in the game each waiting tap was made (finding I)', async () => {
    const network = endpointNetwork();
    const { controller } = device(network);
    await controller.start();
    await tapAll(controller, tipOff);
    await controller.idle();
    network.mode = 'down';
    await tapAll(controller, [{ type: 'set-clock', ms: 125_000 }, a]);
    expect(controller.status().waiting).toEqual([
      expect.objectContaining({ moment: { period: 1, clockMs: 1_200_000 } }),
      { command: expect.objectContaining({ input: a }), moment: { period: 1, clockMs: 125_000 } },
    ]);
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
    expect(tablet.controller.status().notSaved.map(inputOf)).toEqual([a, b]);
    await tablet.controller.leave();

    const reloaded = device(network, { storage });
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().mode).toMatchObject({ kind: 'held-by-other' });
    expect(reloaded.controller.status().notSaved.map(inputOf)).toEqual([a, b]);
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
    expect(status.notSaved.map(inputOf)).toEqual([a, b]);
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
    expect(status.notSaved.map(inputOf)).toEqual([a]);
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
    expect(status.notSaved.map(inputOf)).toEqual([a]);
    expect(scoreOf(status.game)).toEqual({ home: 0, away: 0 });
    expect((await inner.list(gameId)).map((entry) => entry.state)).toEqual(['not-saved']);

    // Taking the game back never sends it.
    await takeBack(tablet.controller);
    await tablet.controller.idle();
    expect((await serverGame(network)).sequence).toBe(2);
    expect(tablet.controller.status().notSaved.map(inputOf)).toEqual([a]);
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

describe('tracker controller: a play the server took is never listed as not saved', () => {
  const a = basket('home', hawks[2] ?? '');
  const b = basket('away', bears[3] ?? '', 3);

  it('taking the game back waits for a batch still on its way (finding M1)', async () => {
    const network = endpointNetwork();
    let holding: ReturnType<typeof gate> | null = null;
    const tablet = device(network, {
      sendTaps: (send) => async (input, init) => {
        const held = holding;
        const answer = await send(input, init);
        if (held !== null) await held.shut;
        return answer;
      },
    });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    // The server takes the next batch; its answer is held back.
    const inFlight = gate();
    holding = inFlight;
    await tapAll(tablet.controller, [a]);
    await expect.poll(async () => (await serverGame(network)).sequence).toBe(3);
    holding = null;
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();

    const everListed: string[] = [];
    tablet.controller.subscribe((s) => {
      for (const t of s.notSaved) everListed.push(t.command.commandId);
    });
    // The tablet learns it lost the game, is shown the laptop, and takes the game back,
    // all while the answer for its batch is still on its way.
    tablet.controller.online();
    await expect.poll(() => tablet.controller.status().mode.kind).toBe('read-only');
    const opening = tablet.controller.openAgain();
    await expect.poll(() => tablet.controller.status().mode.kind).toBe('held-by-other');
    const taking = tablet.controller.takeOver();
    await expect.poll(() => network.reached).toContain('POST session:take-over');
    // Time for the takeover's answer to be acted on before the batch's arrives.
    for (let i = 0; i < 20; i += 1) await flush();
    inFlight.open();
    expect(await taking).toEqual({ ok: true });
    await opening;
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(everListed).toEqual([]);
    expect(status.notSaved).toEqual([]);
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    expect(await tablet.storage.list(gameId)).toEqual([]);
    expect((await serverGame(network)).sequence).toBe(3);
  });

  it('a tap the server took though its answer was lost is dropped from the list once the state shows it (finding M1)', async () => {
    const network = endpointNetwork();
    const storage = createMemoryQueueStorage();
    const tablet = device(network, { storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    // Taken by the server; the answer never comes back, and the tab closes.
    network.mode = 'answers-lost';
    await tapAll(tablet.controller, [a]);
    await tablet.controller.idle();
    await tablet.controller.leave();
    expect((await serverGame(network)).sequence).toBe(3);
    network.mode = 'up';
    // The laptop has the game meanwhile, and leaves it.
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    await laptop.controller.leave();

    // Reopened into a new session, the tap made under the old one is set aside, but the
    // state the device loads holds it: it is saved, so it is not listed.
    const reopened = device(network, { storage });
    await reopened.controller.start();
    await reopened.controller.idle();
    const status = reopened.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.notSaved).toEqual([]);
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    expect(await storage.list(gameId)).toEqual([]);
  });

  it('a tap sent and taken while it was being stored, before the game was lost, is not listed (finding L1)', async () => {
    const network = endpointNetwork();
    const inner = createMemoryQueueStorage();
    const storing = gate();
    let armed = false;
    let holdNextRead = false;
    const storage: QueueStorage = {
      add: async (g, e) => {
        const added = await inner.add(g, e);
        if (armed) {
          armed = false;
          holdNextRead = true;
        }
        return added;
      },
      // The read that follows storing the tap is held back, so the tap is not yet confirmed.
      list: async (g) => {
        if (holdNextRead) {
          holdNextRead = false;
          await storing.shut;
        }
        return inner.list(g);
      },
      settle: (g, s) => inner.settle(g, s),
    };
    const tablet = device(network, { storage });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    armed = true;
    const tapping = tablet.controller.tap(a);
    await expect.poll(() => armed || holdNextRead).toBe(false);
    // The network is back: the queue sends the tap and the server takes it.
    tablet.controller.online();
    await expect.poll(async () => (await serverGame(network)).sequence).toBe(3);
    // Then the game is lost to the laptop, still before the tap is confirmed.
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await expect.poll(() => tablet.controller.status().mode.kind).toBe('read-only');
    storing.open();
    expect(await tapping).toMatchObject({ ok: true });
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.notSaved).toEqual([]);
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    expect(await inner.list(gameId)).toEqual([]);
  });

  it('that tap, taken by the server, stays shown when the reload after the loss gets no answer', async () => {
    const network = endpointNetwork();
    const inner = createMemoryQueueStorage();
    const storing = gate();
    let armed = false;
    let holdNextRead = false;
    let stateDown = false;
    const storage: QueueStorage = {
      add: async (g, e) => {
        const added = await inner.add(g, e);
        if (armed) {
          armed = false;
          holdNextRead = true;
        }
        return added;
      },
      list: async (g) => {
        if (holdNextRead) {
          holdNextRead = false;
          await storing.shut;
        }
        return inner.list(g);
      },
      settle: (g, s) => inner.settle(g, s),
    };
    const tablet = device(network, {
      storage,
      askServer: (ask) => (input, init) =>
        stateDown && String(input).endsWith('/state')
          ? Promise.reject(new TypeError('Failed to fetch'))
          : ask(input, init),
    });
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    armed = true;
    const tapping = tablet.controller.tap(a);
    await expect.poll(() => armed || holdNextRead).toBe(false);
    tablet.controller.online();
    await expect.poll(async () => (await serverGame(network)).sequence).toBe(3);
    const laptop = device(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.start();
    await laptop.controller.idle();
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    // The loss's reload of the server's state gets no answer.
    stateDown = true;
    tablet.controller.online();
    await expect.poll(() => tablet.controller.status().mode.kind).toBe('read-only');
    storing.open();
    expect(await tapping).toMatchObject({ ok: true });
    await tablet.controller.idle();
    expect(tablet.controller.status().notSaved).toEqual([]);
    // Saved on the server, so shown here too: the game is not short of it.
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 0 });
  });

  it('a dismissal that fails while a loss is listed leaves the plays listed (the review’s Low 1)', async () => {
    const network = endpointNetwork();
    const inner = createMemoryQueueStorage();
    let failNextSettle: ReturnType<typeof gate> | null = null;
    const storage: QueueStorage = {
      add: (g, e) => inner.add(g, e),
      list: (g) => inner.list(g),
      // The next write is held back, then fails: the dismissal is not stored.
      settle: async (g, s) => {
        const held = failNextSettle;
        if (held === null) return inner.settle(g, s);
        failNextSettle = null;
        await held.shut;
        throw new Error('disk full');
      },
    };
    const { tablet, laptop } = await tabletLosesTheGame(network, [a], storage);
    await takeBack(tablet.controller);
    network.mode = 'down';
    await tapAll(tablet.controller, [b]);
    network.mode = 'up';
    laptop.controller.online();
    await laptop.controller.idle();
    await takeBack(laptop.controller);

    const writing = gate();
    failNextSettle = writing;
    const dismissing = tablet.controller.dismissNotSaved();
    // While the dismissal is being written, the tablet loses the game again and lists it.
    tablet.controller.online();
    await expect.poll(() => tablet.controller.status().notSaved.map(inputOf)).toEqual([b]);
    writing.open();
    await expect(dismissing).rejects.toThrow();
    await tablet.controller.idle();
    // Still stored as not saved, so still listed.
    expect(tablet.controller.status().notSaved.map(inputOf)).toEqual([a, b]);
    expect((await inner.list(gameId)).map((e) => [e.command.input, e.state])).toEqual([
      [a, 'not-saved'],
      [b, 'not-saved'],
    ]);
  });

  it('a takeover turned away (signed out) finishes the loss: the server’s game is shown (finding L2)', async () => {
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
          // The sign-in ran out just then: the server's own 401.
          return network.fetchAs('visitor')(input, init);
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
    await tapAll(laptop.controller, [basket('home', hawks[0] ?? '')]);
    await laptop.controller.idle();

    // Shown the holder, the tablet's state reload is held up; the takeover begins and
    // the reload is stopped by it.
    stateGate = gate();
    const asked = statesAsked;
    const opening = tablet.controller.openAgain();
    await expect.poll(() => statesAsked).toBe(asked + 1);
    takeOverGate = gate();
    const taking = tablet.controller.takeOver();
    const held = stateGate;
    stateGate = null;
    held.open();
    await opening;
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 0, away: 0 });
    takeOverGate.open();
    expect(await taking).toEqual({ ok: true });
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'signed-out' });
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 0 });
  });

  it('dismissing the not-saved list while a loss is being listed does not bring them back (finding L3)', async () => {
    const network = endpointNetwork();
    const inner = createMemoryQueueStorage();
    let watched: ReturnType<typeof device>['controller'] | null = null;
    let reading: ReturnType<typeof gate> | null = null;
    let readBegun = false;
    const storage: QueueStorage = {
      add: (g, e) => inner.add(g, e),
      // The read the loss lists from is taken, then held back before it is used.
      list: async (g) => {
        const held = reading;
        const snapshot = await inner.list(g);
        const status = watched?.status();
        // The loss reads once the queue has stopped sending.
        if (held !== null && status?.mode.kind === 'read-only' && !status.queue.sending) {
          reading = null;
          readBegun = true;
          await held.shut;
        }
        return snapshot;
      },
      settle: (g, s) => inner.settle(g, s),
    };
    const { tablet, laptop } = await tabletLosesTheGame(network, [a], storage);
    await takeBack(tablet.controller);
    expect(tablet.controller.status().notSaved.map(inputOf)).toEqual([a]);
    network.mode = 'down';
    await tapAll(tablet.controller, [b]);
    network.mode = 'up';
    laptop.controller.online();
    await laptop.controller.idle();
    await takeBack(laptop.controller);

    // The tablet loses the game again; while that loss reads the storage, the
    // scorekeeper dismisses the list shown.
    watched = tablet.controller;
    const listing = gate();
    reading = listing;
    tablet.controller.online();
    await expect.poll(() => readBegun).toBe(true);
    await tablet.controller.dismissNotSaved();
    listing.open();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
    expect(tablet.controller.status().notSaved.map(inputOf)).toEqual([b]);
    expect((await inner.list(gameId)).map((e) => [e.command.input, e.state])).toEqual([
      [b, 'not-saved'],
    ]);
  });
});

describe('tracker controller: which taps wait, and the last save (finding L1)', () => {
  it('names each waiting tap, the plays still to save, and when the last one was saved', async () => {
    // The server keeps its own clock, far from the device's and moved apart from it:
    // the stand-in reads the system clock, which the device's controller never does
    // (finding M3), so the system clock here is the server's.
    const serverClock = createManualClock(1_900_000_000_000);
    const onTheServer = vi.spyOn(Date, 'now').mockImplementation(() => serverClock.now());
    onTestFinished(() => onTheServer.mockRestore());
    const network = endpointNetwork();
    const { controller, clock } = device(network);
    await controller.start();
    await tapAll(controller, tipOff);
    await controller.idle();
    const firstSave = controller.status().lastSavedAt ?? 0;
    // On the server's clock, exactly: nothing moves during a request here.
    expect(controller.status().clockErrorMs).toBe(0);
    expect(firstSave).toBe(serverClock.now());

    network.mode = 'down';
    const offline = [basket('home', hawks[0] ?? ''), basket('away', bears[1] ?? '', 3)];
    await tapAll(controller, offline);
    let status = controller.status();
    expect(status.waiting.map(inputOf)).toEqual(offline);
    const unsaved = new Set(status.waiting.map((t) => t.command.commandId));
    const plays = status.game?.plays ?? [];
    expect(plays.filter((p) => unsaved.has(p.id)).map((p) => p.type)).toEqual(['score', 'score']);
    expect(plays.filter((p) => !unsaved.has(p.id)).map((p) => p.type)).toEqual([
      'lineup',
      'lineup',
    ]);
    // Five minutes pass on the device while offline; the server's clock moves two (the
    // device's clock is not the server's: it may stand still asleep, or run on).
    await clock.advance(5 * minute);
    await serverClock.advance(2 * minute);
    expect(controller.status().lastSavedAt).toBe(firstSave);

    network.mode = 'up';
    controller.online();
    await controller.idle();
    status = controller.status();
    expect(status.waiting).toEqual([]);
    // The save is timed by the server's clock: two minutes after the first, not five.
    const lastSave = status.lastSavedAt ?? 0;
    expect(lastSave).toBe(serverClock.now());
    expect(lastSave - firstSave).toBe(2 * minute);
    expect(status.now()).toBe(serverClock.now());
  });

  it('a save answered before the renewal that measures the server’s time again is put on that measurement', async () => {
    const serverClock = createManualClock(1_900_000_000_000);
    const onTheServer = vi.spyOn(Date, 'now').mockImplementation(() => serverClock.now());
    onTestFinished(() => onTheServer.mockRestore());
    const network = endpointNetwork();
    let renewing: ReturnType<typeof gate> | null = null;
    const { controller, clock } = device(network, {
      askServer: (ask) => async (input, init) => {
        const held = String(init?.body).includes('"renew"') ? renewing : null;
        const answer = await ask(input, init);
        if (held !== null) await held.shut;
        return answer;
      },
    });
    await controller.start();
    await tapAll(controller, tipOff);
    await controller.idle();
    const firstSave = controller.status().lastSavedAt ?? 0;
    network.mode = 'down';
    await tapAll(controller, [basket('home', hawks[0] ?? '')]);
    await clock.advance(5 * minute);
    await serverClock.advance(2 * minute);
    network.mode = 'up';
    // The renewal's answer is held back until the tap is saved.
    const renewal = gate();
    renewing = renewal;
    controller.online();
    await expect.poll(() => controller.status().waiting.length).toBe(0);
    renewal.open();
    await controller.idle();
    expect(controller.status().lastSavedAt).toBe(serverClock.now());
    expect((controller.status().lastSavedAt ?? 0) - firstSave).toBe(2 * minute);
  });
});

/**
 * A server whose clock is `aheadMs` ahead of the device's, answering a session request
 * `up` ms after it is sent (when it stamps its time) and `down` ms after that.
 */
function timedServer(clock: ManualClock, aheadMs: number, slept: () => number = () => 0) {
  const legs = { up: 100, down: 100 };
  const sessionId = '01900000-0000-7000-8000-0000000000c1';
  const server: TrackerServer = {
    session: () =>
      new Promise((resolve) => {
        const up = legs.up;
        const down = legs.down;
        clock.after(up, () => {
          // The server's clock ran on while the device slept; the device's steady one did not.
          const sentAt = clock.now() + aheadMs + slept();
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

/**
 * A controller on a timed server whose device can sleep: `sleep(ms)` moves the wall
 * clock and the server's clock on while the steady clock stands still, as an iPad's
 * does; `setWall(ms)` changes the wall clock by hand.
 */
function sleepyDevice() {
  const clock = createManualClock();
  const ahead = 30_000;
  let slept = 0;
  let handChange = 0;
  const { legs, server } = timedServer(clock, ahead, () => slept);
  const sessions: number[] = [];
  const counted: TrackerServer = {
    session: (request, signal) => {
      sessions.push(clock.now());
      return server.session(request, signal);
    },
    loadState: (signal) => server.loadState(signal),
  };
  const queueServer = createFakeServer(clock);
  const controller = createTrackerController({
    gameId,
    deviceId: 'tablet-1',
    storage: createMemoryQueueStorage(),
    transport: queueServer.transport,
    server: counted,
    clock,
    wallClock: () => clock.now() + slept + handChange,
    newCommandId,
    random: () => 1,
  });
  return {
    clock,
    legs,
    controller,
    queueServer,
    sessions,
    serverTime: () => clock.now() + ahead + slept,
    sleep: (ms: number) => void (slept += ms),
    setWall: (ms: number) => void (handChange += ms),
  };
}

describe('tracker controller: a device that sleeps (the second review’s Medium)', () => {
  it('a five-minute sleep with no signal: taps are timed right before any reply', async () => {
    const d = sleepyDevice();
    d.legs.up = 20;
    d.legs.down = 20;
    await until(d.clock, d.controller.start());
    await until(d.clock, d.controller.idle());
    await tapAll(d.controller, tipOff);
    expect(d.controller.status().now()).toBe(d.serverTime());
    // No signal from here on: nothing will answer.
    d.legs.up = 60_000;
    // Locked at half-time for five minutes; the steady clock stood still.
    d.sleep(5 * minute);
    expect(d.controller.status().now()).toBe(d.serverTime());
    const expected = d.serverTime();
    await tapAll(d.controller, [basket('home', hawks[0] ?? '')]);
    const sent = () =>
      d.queueServer.received
        .flatMap((batch) => batch.commands)
        .find((c) => c.input.type === 'score');
    await expect.poll(sent).toBeDefined();
    expect(sent()?.at).toBe(expected);
    // Less sure than measured, by the margin a sleep is told by.
    expect(d.controller.status().clockErrorMs).toBe(20 + 3_000);
    // The release gets no answer either: it is given up after its time.
    await until(d.clock, d.controller.leave());
  });

  it('a wall clock put back an hour by hand, set right again, or on by a second, does not move now()', async () => {
    const d = sleepyDevice();
    d.legs.up = 20;
    d.legs.down = 20;
    await until(d.clock, d.controller.start());
    await until(d.clock, d.controller.idle());
    const before = d.controller.status().now();
    d.setWall(-60 * minute);
    expect(d.controller.status().now()).toBe(before);
    // Set right again an hour later (by hand, or the network's time): not a sleep.
    d.setWall(60 * minute);
    expect(d.controller.status().now()).toBe(before);
    d.setWall(1_000);
    expect(d.controller.status().now()).toBe(before);
    expect(d.controller.status().clockErrorMs).toBe(20);
    await until(d.clock, d.controller.leave());
  });

  it('awake() carries the time on across the sleep, and renews the session at once', async () => {
    const d = sleepyDevice();
    d.legs.up = 20;
    d.legs.down = 20;
    await until(d.clock, d.controller.start());
    await until(d.clock, d.controller.idle());
    const asked = d.sessions.length;
    d.sleep(5 * minute);
    // The page is shown again: nobody has read the time yet.
    d.controller.awake();
    expect(d.sessions.length).toBe(asked + 1);
    expect(d.controller.status().now()).toBe(d.serverTime());
    await until(d.clock, d.controller.idle());
    // Measured again: as close as before the sleep.
    expect(d.controller.status().clockErrorMs).toBe(20);
    expect(d.controller.status().now()).toBe(d.serverTime());
    await until(d.clock, d.controller.leave());
  });
});

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
      wallClock: clock.now,
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

  it('keeps the closer measurement over a quick but less close one, until it has aged, and never steps back (finding L4)', async () => {
    const clock = createManualClock();
    const ahead = 30_000;
    const { legs, server } = timedServer(clock, ahead);
    const controller = createTrackerController({
      gameId,
      deviceId: 'tablet-1',
      storage: createMemoryQueueStorage(),
      transport: createFakeServer(clock).transport,
      server,
      clock,
      wallClock: clock.now,
      newCommandId,
      random: () => 1,
    });
    const serverTime = () => clock.now() + ahead;
    legs.up = 20;
    legs.down = 20;
    await until(clock, controller.start());
    await until(clock, controller.idle());
    expect(controller.status().clockErrorMs).toBe(20);
    expect(controller.status().now()).toBe(serverTime());

    // Quick (well under two seconds) but lopsided: its midpoint is 150 ms behind. The
    // closer measurement is kept, so the clock does not jump back.
    legs.up = 50;
    legs.down = 350;
    controller.online();
    await until(clock, controller.idle());
    expect(controller.status().clockErrorMs).toBe(20);
    expect(controller.status().now()).toBe(serverTime());

    // Five minutes with no answer to the renewals: the measurement ages.
    legs.up = 20_000;
    await clock.advance(5 * minute);
    await until(clock, controller.idle());
    // A fresh one is now closer than the aged one: it is taken, though it is behind.
    legs.up = 50;
    legs.down = 350;
    controller.online();
    await clock.advance(390);
    // The clock as painted just before the reply comes back.
    const painted = controller.status().now();
    await until(clock, controller.idle());
    expect(controller.status().clockErrorMs).toBe(200);
    // It never goes back: it waits for the server's time to catch up instead.
    expect(controller.status().now()).toBeGreaterThanOrEqual(painted);
    await clock.advance(1_000);
    expect(serverTime() - controller.status().now()).toBe(150);
    await until(clock, controller.leave());
  });
});
