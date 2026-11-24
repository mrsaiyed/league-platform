// The device's side of step 2.148, over the real endpoints and a stand-in world: the
// takeover question carries who holds the game, when that device was last heard from
// and the server's mark for the same account on another device (S-42); plays listed as
// not saved after a takeover are sent only by the scorekeeper's "Send these plays",
// taken only when nothing was recorded since, and otherwise stay listed to be entered
// again (S-43, T-335).
import { TrackerGameState } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it, vi } from 'vitest';
import { standInPeople } from '../../server/stand-in-cast.ts';
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
import { inLeague, type QueueStorage } from './queue-storage.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00e8${commandNumber.toString(16).padStart(8, '0')}`;
};

const accountOf = (as: Person): string =>
  as in standInPeople ? standInPeople[as as keyof typeof standInPeople].accountId : as;

function device(
  network: EndpointNetwork,
  as: Person = 'scorekeeper',
  deviceId = 'tablet-1',
  kept: QueueStorage = createMemoryQueueStorage(),
  wrap: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch = (fetch) => fetch,
) {
  // What a device keeps is one person's (T-327): the page keeps it so too.
  const storage = inLeague(kept, liveLeagueId, accountOf(as));
  const clock = createManualClock();
  const fetch = wrap((input, init) => network.fetchAs(as)(input, init));
  const controller = createTrackerController({
    gameId,
    deviceId,
    storage,
    clock,
    wallClock: clock.now,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
  });
  return { controller, storage: kept };
}

async function serverScore(network: EndpointNetwork) {
  const context = await network.world.contextAs('owner', 'live', ['games', gameId, 'state']);
  const answer = await trackerStateRequest(context, gameId, network.world.tracker);
  const { state } = TrackerGameState.parse(answer.body) as unknown as {
    state: basketball.GameState;
  };
  const { home, away } = basketball.derive(state).teams;
  return { home: home.score, away: away.score };
}

const tipOff: TapInput[] = [
  { type: 'lineup', side: 'home', playerIds: hawks },
  { type: 'lineup', side: 'away', playerIds: bears },
  // The clock started: the game is under way, and live on the server.
  { type: 'start' },
];
const basket = (side: 'home' | 'away', playerId: string): TapInput => ({
  type: 'score',
  side,
  playerId,
  points: 2,
});
const threeBaskets = [0, 1, 2].map((i) => basket('home', hawks[i] ?? ''));

type Controller = ReturnType<typeof device>['controller'];
async function tapAll(controller: Controller, inputs: TapInput[]) {
  for (const input of inputs) expect(await controller.tap(input)).toMatchObject({ ok: true });
}

/**
 * The tablet scores, loses its signal with three baskets made, and the laptop takes over;
 * with `laptopScores`, the laptop records it before the tablet is heard from again.
 */
async function tabletLosesTheGame(network: EndpointNetwork, laptopScores: TapInput[] = []) {
  // With the laptop scoring first, the tablet's renewal is slowed until its waiting batch
  // is answered, so it hears "not held" with the laptop's play in the sequence first.
  let slowRenewal = false;
  let batchAnswered = () => undefined as void;
  const answeredFirst = new Promise<void>((resolve) => (batchAnswered = resolve));
  const wrap =
    (fetch: typeof globalThis.fetch): typeof globalThis.fetch =>
    async (input, init) => {
      const url = String(input);
      if (slowRenewal && url.endsWith('/session')) await answeredFirst;
      const response = await fetch(input, init);
      if (slowRenewal && url.endsWith('/commands')) batchAnswered();
      return response;
    };
  const tablet = device(network, 'scorekeeper', 'tablet-1', createMemoryQueueStorage(), wrap);
  await tablet.controller.start();
  await tapAll(tablet.controller, tipOff);
  await tablet.controller.idle();
  network.mode = 'down';
  await tapAll(tablet.controller, threeBaskets);
  network.mode = 'up';
  const laptop = device(network, 'owner', 'laptop');
  await laptop.controller.start();
  await laptop.controller.idle();
  expect(await laptop.controller.takeOver()).toEqual({ ok: true });
  await laptop.controller.idle();
  await tapAll(laptop.controller, laptopScores);
  await laptop.controller.idle();
  slowRenewal = laptopScores.length > 0;
  tablet.controller.online();
  await tablet.controller.idle();
  expect(tablet.controller.status().mode).toEqual({ kind: 'read-only', reason: 'taken-over' });
  expect(tablet.controller.status().notSaved).toHaveLength(3);
  return { tablet, laptop };
}

describe('the takeover question’s facts (S-42)', () => {
  it('names when the holder’s device was last heard from, and marks the same account on another device', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    await tablet.controller.idle();
    const laptop = device(network, 'owner', 'laptop');
    await laptop.controller.start();
    await laptop.controller.idle();
    const asked = laptop.controller.status().mode;
    expect(asked).toMatchObject({
      kind: 'held-by-other',
      holder: { lastHeardAt: expect.any(Number) },
    });
    expect(asked.kind === 'held-by-other' && asked.holder.sameAccount).toBeFalsy();
    const phone = device(network, 'scorekeeper', 'phone');
    await phone.controller.start();
    await phone.controller.idle();
    expect(phone.controller.status().mode).toMatchObject({
      kind: 'held-by-other',
      holder: { sameAccount: true },
    });
  });
});

describe('send these plays (S-43, T-335)', () => {
  it('is offered, never done by the device itself, and puts the plays on the server once', async () => {
    const network = endpointNetwork();
    const { tablet } = await tabletLosesTheGame(network);
    expect(tablet.controller.status().sendNotSaved).toBe('offered');
    // The device going on and off line sends nothing by itself.
    tablet.controller.online();
    await tablet.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 0, away: 0 });

    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: true, saved: 3 });
    await tablet.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 6, away: 0 });
    expect(tablet.controller.status().notSaved).toEqual([]);
    expect(tablet.controller.status().sendNotSaved).toBe('none');
    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: false, reason: 'not-offered' });
    expect(await serverScore(network)).toEqual({ home: 6, away: 0 });
  });

  it('is refused when the new scorekeeper recorded a play in between; the plays stay listed to enter again', async () => {
    const network = endpointNetwork();
    const { tablet, laptop } = await tabletLosesTheGame(network);
    await tapAll(laptop.controller, [basket('away', bears[0] ?? '')]);
    await laptop.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 0, away: 2 });
    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: false, reason: 'game-moved' });
    expect(tablet.controller.status().sendNotSaved).toBe('game-moved');
    expect(tablet.controller.status().notSaved).toHaveLength(3);
    expect(await serverScore(network)).toEqual({ home: 0, away: 2 });
    // The new holder enters each again (S-77) once it is read out.
    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: false, reason: 'not-offered' });
  });

  // The plan's worst night (fix round): the tablet's waiting batch is answered "not held"
  // with the game's sequence, the laptop's play in it, before the tablet learns it lost.
  it('is refused when the new scorekeeper recorded while the tablet was still offline, then the tablet learned it lost the game', async () => {
    const network = endpointNetwork();
    const { tablet } = await tabletLosesTheGame(network, [basket('away', bears[0] ?? '')]);
    expect(await serverScore(network)).toEqual({ home: 0, away: 2 });
    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: false, reason: 'game-moved' });
    expect(tablet.controller.status().notSaved).toHaveLength(3);
    expect(await serverScore(network)).toEqual({ home: 0, away: 2 });
  });

  it('is still offered after a reload, to the same person only, and puts the plays on the server once', async () => {
    const network = endpointNetwork();
    const { tablet } = await tabletLosesTheGame(network);
    await tablet.controller.leave();
    // Another person signed in on the same device is never shown them, nor offered them (T-327).
    const other = device(network, 'owner', 'tablet-1', tablet.storage);
    await other.controller.start();
    await other.controller.idle();
    expect(other.controller.status().notSaved).toEqual([]);
    expect(other.controller.status().sendNotSaved).toBe('none');
    await other.controller.leave();
    // The list kept the sequence its plays were made on (T-337): "Send these plays" survives the reload.
    const reloaded = device(network, 'scorekeeper', 'tablet-1', tablet.storage);
    await reloaded.controller.start();
    await reloaded.controller.idle();
    expect(reloaded.controller.status().notSaved).toHaveLength(3);
    expect(reloaded.controller.status().sendNotSaved).toBe('offered');
    expect(await reloaded.controller.sendNotSaved()).toEqual({ ok: true, saved: 3 });
    expect(await serverScore(network)).toEqual({ home: 6, away: 0 });
    expect(await reloaded.controller.sendNotSaved()).toEqual({ ok: false, reason: 'not-offered' });
  });
});

describe('the device holding the game after plays were sent (T-338)', () => {
  const shown = (controller: Controller) => {
    const { home, away } = basketball.derive(
      controller.status().game ?? basketball.newGame(),
    ).teams;
    return { home: home.score, away: away.score };
  };

  it('loads the game again at its next tap: its taps count on top of the sent plays, none lost, none twice', async () => {
    const network = endpointNetwork();
    const { tablet, laptop } = await tabletLosesTheGame(network);
    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: true, saved: 3 });
    expect(await serverScore(network)).toEqual({ home: 6, away: 0 });
    await tapAll(laptop.controller, [basket('away', bears[0] ?? '')]);
    await laptop.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 6, away: 2 });
    expect(shown(laptop.controller)).toEqual({ home: 6, away: 2 });
    await tapAll(laptop.controller, [basket('away', bears[1] ?? '')]);
    await laptop.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 6, away: 4 });
    expect(shown(laptop.controller)).toEqual({ home: 6, away: 4 });
    expect(laptop.controller.status().mode).toEqual({ kind: 'scoring' });
  });

  /**
   * After the tablet's three were sent, the laptop makes 53 baskets with no signal: the
   * first batch (50) is taken while the other three are still on their way (held here),
   * so this device's own taps outnumber the server's jump until they drain (review Low).
   */
  async function laptopBehindSentPlays(holdState: boolean) {
    const network = endpointNetwork();
    let commandPosts = 0;
    let releaseBatch = () => undefined as void;
    const batchHeld = new Promise<void>((resolve) => (releaseBatch = resolve));
    let releaseState = () => undefined as void;
    const stateHeld = new Promise<void>((resolve) => (releaseState = resolve));
    let gate = false;
    let stateAsked = false;
    const wrap =
      (fetch: typeof globalThis.fetch): typeof globalThis.fetch =>
      async (input, init) => {
        const url = String(input);
        if (gate && url.endsWith('/commands') && init?.method === 'POST') {
          commandPosts += 1;
          if (commandPosts === 2) await batchHeld;
        }
        if (gate && url.endsWith('/state') && (init?.method ?? 'GET') === 'GET' && !stateAsked) {
          stateAsked = true;
          if (holdState) await stateHeld;
        }
        return fetch(input, init);
      };
    const tablet = device(network);
    await tablet.controller.start();
    await tapAll(tablet.controller, tipOff);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet.controller, threeBaskets);
    network.mode = 'up';
    const laptop = device(network, 'owner', 'laptop', createMemoryQueueStorage(), wrap);
    await laptop.controller.start();
    await laptop.controller.idle();
    expect(await laptop.controller.takeOver()).toEqual({ ok: true });
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    expect(await tablet.controller.sendNotSaved()).toEqual({ ok: true, saved: 3 });
    network.mode = 'down';
    await tapAll(
      laptop.controller,
      Array.from({ length: 53 }, (_, i) => basket('away', bears[i % 5] ?? '')),
    );
    network.mode = 'up';
    gate = true;
    laptop.controller.online();
    // The first batch is answered, and the second is held on its way.
    await vi.waitFor(() => expect(commandPosts).toBe(2));
    return { network, laptop, releaseBatch, releaseState, stateAsked: () => stateAsked };
  }

  it('loads the game again at the first answer that shows the jump, while its own taps are still on their way', async () => {
    const { network, laptop, releaseBatch } = await laptopBehindSentPlays(false);
    await vi.waitFor(() => expect(shown(laptop.controller)).toEqual({ home: 6, away: 106 }));
    expect(await serverScore(network)).toEqual({ home: 6, away: 100 });
    releaseBatch();
    await laptop.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 6, away: 106 });
    expect(shown(laptop.controller)).toEqual({ home: 6, away: 106 });
  });

  it('a load with taps on their way and a tap waiting behind them neither doubles nor drops one', async () => {
    const { network, laptop, releaseBatch, releaseState, stateAsked } =
      await laptopBehindSentPlays(true);
    await vi.waitFor(() => expect(stateAsked()).toBe(true));
    // One more while the load is under way: waiting behind the three on their way.
    await tapAll(laptop.controller, [basket('away', bears[0] ?? '')]);
    // The three on their way and the one behind them are all taken before the state comes
    // back, so the state holds every tap this device still keeps on top of its game.
    releaseBatch();
    await vi.waitFor(async () =>
      expect(await serverScore(network)).toEqual({ home: 6, away: 108 }),
    );
    releaseState();
    await laptop.controller.idle();
    expect(await serverScore(network)).toEqual({ home: 6, away: 108 });
    expect(shown(laptop.controller)).toEqual({ home: 6, away: 108 });
    expect(laptop.controller.status().waiting).toEqual([]);
  });
});
