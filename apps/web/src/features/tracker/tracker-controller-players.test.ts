// The controller's changes of players (step 2.118, part 1) through the real tracker
// addresses over the stand-in: each has every promise a tap has (timed by the server's
// time, checked before it is stored, stored before it is listed, refused when not
// scoring, listed not saved on a loss, kept with the person who made it), and the
// rosters the controller lists are the kept ones with this device's waiting changes,
// fetched again on opening, taking over, a loss, a refused change and the network back.
import { TrackerRosters } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { trackerRostersRequest } from '../../server/tracker-rosters-endpoint.ts';
import {
  bears,
  games,
  hawks,
  liveLeagueId,
  type Person,
} from '../../server/tracker-endpoints.test-helper.ts';
import { deviceRosters } from './device-rosters.ts';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import type { DeviceRosters } from './opened-game-storage.ts';
import { inLeague, QueueError, type QueueStorage } from './queue-storage.ts';
import { numbersOfLine, type PlayerChange } from './roster-changes.ts';
import { createTrackerController, type TrackerController } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;
let n = 0;
const newCommandId = () => {
  n += 1;
  return `01900000-0000-7000-8000-00c1${n.toString(16).padStart(8, '0')}`;
};
const newPlayerId = () => {
  n += 1;
  return `01900000-0000-4000-8000-00c2${n.toString(16).padStart(8, '0')}`;
};

async function serverRosters(network: EndpointNetwork): Promise<DeviceRosters> {
  const context = await network.world.contextAs('scorekeeper', 'live', [
    'games',
    gameId,
    'rosters',
  ]);
  const answer = await trackerRostersRequest(context, gameId, network.world.tracker);
  return deviceRosters(TrackerRosters.parse(answer.body), {});
}

function device(
  network: EndpointNetwork,
  page: DeviceRosters,
  extra: {
    as?: Person;
    deviceId?: string;
    storage?: QueueStorage;
    kept?: DeviceRosters;
    keep?: (r: DeviceRosters) => Promise<void>;
    playerId?: () => string;
  } = {},
) {
  const { as = 'scorekeeper', storage = createMemoryQueueStorage(), deviceId = 'tablet-1' } = extra;
  const clock = createManualClock();
  const fetch = network.fetchAs(as);
  const controller = createTrackerController({
    gameId,
    deviceId,
    storage,
    clock,
    wallClock: clock.now,
    newCommandId,
    newPlayerId: extra.playerId ?? newPlayerId,
    random: () => 1,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
    rosters: {
      page,
      ...(extra.kept === undefined ? {} : { kept: extra.kept }),
      ...(extra.keep === undefined ? {} : { keep: extra.keep }),
    },
  });
  return { controller, storage, clock };
}

const addNumbers = (line: string): PlayerChange[] =>
  numbersOfLine(line).map((jersey) => ({ type: 'add-player', side: 'away', jersey, name: '' }));

const jerseys = (c: TrackerController, side: 'home' | 'away') =>
  (c.status().rosters?.[side].players ?? []).map((p) => p.jerseyNumber);

async function opened(network: EndpointNetwork, extra: Parameters<typeof device>[2] = {}) {
  const made = device(network, await serverRosters(network), extra);
  await made.controller.start();
  await made.controller.idle();
  return made;
}

describe('tracker controller: a change of players has every promise a tap has', () => {
  it('adds a line of numbers in order, timed by the server, listed at once and saved', async () => {
    const network = endpointNetwork();
    const { controller, storage } = await opened(network);
    const before = jerseys(controller, 'away').length;
    network.mode = 'down';
    const result = await controller.changePlayers(addNumbers('3 5 10 12 14'));
    expect(result).toMatchObject({ ok: true });
    // Stored, in order, each timed by the server's time.
    const kept = await storage.list(gameId);
    expect(kept.map((e) => e.command.input)).toMatchObject(
      ['3', '5', '10', '12', '14'].map((jersey) => ({ type: 'add-player', jersey })),
    );
    for (const e of kept) expect(e.command.at).toBe(controller.status().now());
    // Listed with no signal, before the server has them.
    expect(jerseys(controller, 'away').slice(before)).toEqual(['3', '5', '10', '12', '14']);
    expect(controller.status().queue.waiting).toBe(5);
    network.mode = 'up';
    controller.online();
    await controller.idle();
    expect(controller.status().queue.waiting).toBe(0);
    // Taken: still listed, and the server's rosters have them.
    expect(jerseys(controller, 'away').slice(before)).toEqual(['3', '5', '10', '12', '14']);
    expect((await serverRosters(network)).away.players.map((p) => p.jerseyNumber)).toEqual(
      expect.arrayContaining(['3', '5', '10', '12', '14']),
    );
  });

  it('goes in the one queue in order with the taps: the player before the play naming them', async () => {
    const network = endpointNetwork();
    const { controller, storage } = await opened(network);
    network.mode = 'down';
    const added = await controller.changePlayers(addNumbers('12'));
    if (!added.ok) throw new Error('not added');
    const twelve = added.playerIds[0] ?? '';
    await controller.tap({ type: 'lineup', side: 'home', playerIds: hawks });
    await controller.tap({
      type: 'lineup',
      side: 'away',
      playerIds: [...bears.slice(0, 4), twelve],
    });
    await controller.tap({ type: 'score', side: 'away', playerId: twelve, points: 2 });
    expect((await storage.list(gameId)).map((e) => e.command.input.type)).toEqual([
      'add-player',
      'lineup',
      'lineup',
      'score',
    ]);
    network.mode = 'up';
    controller.online();
    await controller.idle();
    expect(controller.status().queue.refused).toEqual([]);
    expect(controller.status().queue.waiting).toBe(0);
  });

  it('checks the contract and the rules before storing: nothing of a wrong line is kept', async () => {
    const network = endpointNetwork();
    const { controller, storage } = await opened(network);
    expect(await controller.changePlayers(addNumbers('3 123'))).toEqual({
      ok: false,
      reason: 'invalid',
      index: 1,
    });
    const leagues = controller.status().rosters?.home.players[0];
    const renamed = await controller.changePlayers([
      { type: 'change-player', side: 'home', playerId: leagues?.personId ?? '', name: 'New Name' },
    ]);
    expect(renamed).toMatchObject({
      ok: false,
      reason: 'rule',
      problem: { problem: 'on-team-roster' },
    });
    expect(await storage.list(gameId)).toEqual([]);
  });

  it('is refused when not scoring, storing nothing', async () => {
    const network = endpointNetwork();
    const { controller, storage } = device(network, await serverRosters(network));
    expect(await controller.changePlayers(addNumbers('4'))).toEqual({
      ok: false,
      reason: 'not-scoring',
    });
    expect(await storage.list(gameId)).toEqual([]);
  });

  it('is not listed when it could not be stored', async () => {
    const network = endpointNetwork();
    const memory = createMemoryQueueStorage();
    let fail = false;
    const storage: QueueStorage = {
      ...memory,
      add: (...args) =>
        fail ? Promise.reject(new QueueError('storage-write-failed')) : memory.add(...args),
    };
    const { controller } = await opened(network, { storage });
    const before = jerseys(controller, 'away');
    fail = true;
    expect(await controller.changePlayers(addNumbers('7'))).toMatchObject({
      ok: false,
      reason: 'storage',
      stored: 0,
    });
    expect(jerseys(controller, 'away')).toEqual(before);
  });

  it('keeps the person who made it (T-327)', async () => {
    const network = endpointNetwork();
    const accountId = '01900000-0000-4000-8000-0000000acc01';
    const { controller, storage } = await opened(network, {
      storage: inLeague(createMemoryQueueStorage(), liveLeagueId, accountId),
    });
    network.mode = 'down';
    await controller.changePlayers(addNumbers('8'));
    expect((await storage.list(gameId))[0]?.accountId).toBe(accountId);
  });

  it('is listed as not saved when another device took the game meanwhile', async () => {
    const network = endpointNetwork();
    const tablet = await opened(network);
    network.mode = 'down';
    await tablet.controller.changePlayers(addNumbers('21'));
    network.mode = 'up';
    const laptop = await opened(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode.kind).not.toBe('scoring');
    expect(tablet.controller.status().notSaved.map((t) => t.command.input)).toMatchObject([
      { type: 'add-player', jersey: '21' },
    ]);
    // And the laptop, which fetched on taking over, never had the player.
    expect(jerseys(laptop.controller, 'away')).not.toContain('21');
  });
});

describe("tracker controller: the device's rosters", () => {
  it('fetches them on opening: a second device sees the players the first added', async () => {
    const network = endpointNetwork();
    const page = await serverRosters(network);
    const tablet = await opened(network);
    await tablet.controller.changePlayers(addNumbers('31 32'));
    await tablet.controller.idle();
    // The laptop's page was drawn before the adds; opening fetches them.
    const kept: DeviceRosters[] = [];
    const laptop = device(network, page, {
      as: 'owner',
      deviceId: 'laptop',
      keep: async (r) => {
        kept.push(r);
      },
    });
    await laptop.controller.start();
    await laptop.controller.idle();
    expect(jerseys(laptop.controller, 'away')).toEqual(expect.arrayContaining(['31', '32']));
    expect(kept.at(-1)?.away.players.map((p) => p.jerseyNumber)).toEqual(
      expect.arrayContaining(['31', '32']),
    );
  });

  it('lists the waiting adds through a reload with no signal, on the rosters kept before', async () => {
    const network = endpointNetwork();
    const page = await serverRosters(network);
    const storage = createMemoryQueueStorage();
    const first = await opened(network, { storage });
    network.mode = 'down';
    await first.controller.changePlayers(addNumbers('41 42'));
    first.controller.status();
    // The reload: the same storage, no signal, the page's old copy of the rosters.
    const again = device(network, page, { storage });
    await again.controller.start();
    expect(jerseys(again.controller, 'away')).toEqual(expect.arrayContaining(['41', '42']));
    expect(again.controller.status().queue.waiting).toBe(2);
  });

  it('checks an add whose answer was lost against the rosters before calling it not saved', async () => {
    const network = endpointNetwork();
    const tablet = await opened(network);
    // The server takes the add, but its answer never comes back.
    network.mode = 'answers-lost';
    await tablet.controller.changePlayers(addNumbers('51'));
    await tablet.controller.idle();
    expect(tablet.controller.status().queue.waiting).toBe(1);
    network.mode = 'up';
    const laptop = await opened(network, { as: 'owner', deviceId: 'laptop' });
    await laptop.controller.takeOver();
    await laptop.controller.idle();
    tablet.controller.online();
    await tablet.controller.idle();
    expect(tablet.controller.status().mode.kind).not.toBe('scoring');
    // Saved after all: not listed, not kept to send, and on the rosters.
    expect(tablet.controller.status().notSaved).toEqual([]);
    expect(await tablet.storage.list(gameId)).toEqual([]);
    expect(jerseys(tablet.controller, 'away')).toContain('51');
  });

  it('fetches them again after a refused change, and when back online', async () => {
    const network = endpointNetwork();
    // An id already someone's: the server refuses the add (player-id-taken).
    const { controller } = await opened(network, { playerId: () => bears[0] ?? '' });
    const fetches = () => network.reached.filter((r) => r === 'GET rosters').length;
    const opening = fetches();
    expect(opening).toBe(1);
    await controller.changePlayers(addNumbers('61'));
    await controller.idle();
    expect(controller.status().queue.refused[0]?.refusal.problem).toBe('player-id-taken');
    expect(fetches()).toBe(opening + 1);
    expect(jerseys(controller, 'away')).not.toContain('61');
    controller.online();
    await controller.idle();
    expect(fetches()).toBe(opening + 2);
  });
});
