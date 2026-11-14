// Opening a game on the device against the real endpoints over the made-up stand-in
// (endpoint-network.test-helper.ts): the session is taken, the rosters and the state are
// stored on the device (T-115), and the format is confirmed once per device (P7 §5.1).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { games, liveLeagueId, type Person } from '../../server/tracker-endpoints.test-helper.ts';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryOpenedGameStorage } from './memory-opened-game-storage.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { openTrackerGame, screenOf } from './open-tracker-game.ts';
import { madeUpRosters } from './opened-game-storage-contract.test-helper.ts';
import { formatOf, type OpenedGameStorage } from './opened-game-storage.ts';
import { QueueError, type QueueStorage } from './queue-storage.ts';

const gameId = games.hawksBears;

type Device = { readonly queue: QueueStorage; readonly games: OpenedGameStorage };
const newDevice = (): Device => ({
  queue: createMemoryQueueStorage(),
  games: createMemoryOpenedGameStorage(),
});

let deviceNumber = 0;
async function open(network: EndpointNetwork, as: Person, device: Device = newDevice()) {
  const fetch = network.fetchAs(as);
  const opened = await openTrackerGame({
    gameId,
    leagueId: liveLeagueId,
    rosters: madeUpRosters,
    openStorage: async () => device,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
    newDeviceId: () => `device-${(deviceNumber += 1)}`,
    now: () => 1_000,
    controller: { random: () => 1 },
  });
  if (!opened.ok) throw new Error(opened.code);
  await opened.game.controller.start();
  await opened.game.controller.idle();
  return { ...opened.game, device };
}

const screen = (game: Awaited<ReturnType<typeof open>>) =>
  screenOf(game.controller.status(), game.confirmedFormat());

describe('opening a game on the device (T-115, T-116, P7 §5.1)', () => {
  it('takes the session, stores the rosters and the state, and asks to confirm the format', async () => {
    const network = endpointNetwork();
    const game = await open(network, 'scorekeeper');
    expect(game.controller.status().mode).toEqual({ kind: 'scoring' });
    const kept = await game.device.games.find(gameId);
    expect(kept?.rosters).toEqual(madeUpRosters);
    expect(kept?.leagueId).toBe(liveLeagueId);
    expect(kept?.rostersSavedAt).toBe(1_000);
    expect(kept?.state?.sequence).toBe(0);
    expect(kept?.state?.state).toEqual(game.controller.status().game);
    const format = formatOf(kept?.state?.state.rules ?? basketball.DEFAULT_RULES);
    expect(screen(game)).toEqual({ kind: 'confirm-format', format });
    // The state came through the one state read, after the session was taken.
    expect(network.reached).toEqual(['POST session:open', 'GET state']);

    await game.confirmFormat(format);
    expect(screen(game)).toEqual({ kind: 'scoring', format });
    expect((await game.device.games.find(gameId))?.confirmedFormat).toEqual(format);
    await game.controller.leave();
  });

  it('opens straight to scoring on a device that has confirmed the format, with the same id', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const first = await open(network, 'scorekeeper', device);
    const format = screen(first);
    if (format.kind !== 'confirm-format') throw new Error(format.kind);
    await first.confirmFormat(format.format);
    await first.controller.leave();
    const again = await open(network, 'scorekeeper', device);
    expect(again.deviceId).toBe(first.deviceId);
    expect(screen(again)).toEqual({ kind: 'scoring', format: format.format });
    await again.controller.leave();
  });

  it('asks again when the format has changed since it was confirmed', () => {
    const scoring = {
      mode: { kind: 'scoring' } as const,
      game: basketball.newGame(basketball.HALVES),
    };
    expect(screenOf(scoring, formatOf(basketball.QUARTERS))).toEqual({
      kind: 'confirm-format',
      format: formatOf(basketball.HALVES),
    });
    expect(screenOf(scoring, formatOf(basketball.HALVES)).kind).toBe('scoring');
    expect(screenOf({ mode: { kind: 'scoring' }, game: null }, null).kind).toBe('opening');
  });

  it('shows another device who holds the game, and lets it take over', async () => {
    const network = endpointNetwork();
    const first = await open(network, 'scorekeeper');
    const second = await open(network, 'owner');
    expect(screen(second)).toEqual({ kind: 'held-by-other', name: 'Sam Scorekeeper' });
    expect(await second.controller.takeOver()).toEqual({ ok: true });
    await second.controller.idle();
    expect(screen(second).kind).toBe('confirm-format');
    expect((await second.device.games.find(gameId))?.state).not.toBeNull();
    await first.controller.leave();
    await second.controller.leave();
  });

  it('is read-only for someone who may not score the game, and stores no state', async () => {
    const network = endpointNetwork();
    const game = await open(network, 'coach');
    expect(screen(game)).toEqual({ kind: 'read-only', reason: 'not-allowed' });
    expect((await game.device.games.find(gameId))?.state).toBeNull();
  });

  it('opens nothing on a device with no storage', async () => {
    const network = endpointNetwork();
    const fetch = network.fetchAs('scorekeeper');
    const opened = await openTrackerGame({
      gameId,
      leagueId: liveLeagueId,
      rosters: madeUpRosters,
      openStorage: async () => {
        throw new QueueError('storage-unavailable');
      },
      transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
      server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
      newDeviceId: () => 'device',
    });
    expect(opened).toEqual({ ok: false, code: 'storage-unavailable' });
    expect(network.reached).toEqual([]);
  });
});
