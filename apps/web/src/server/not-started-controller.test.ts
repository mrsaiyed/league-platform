// Step 2.121's done test on the device: a game marked not started while a tablet still
// had taps waiting. The tablet runs step 2.113's controller with the browser's own
// transports against the real endpoints in this process (features/tracker's endpoint
// network, over the made-up stand-in); the scorekeeper's phone marks the game not
// started through POST …/not-started. The tablet's waiting taps meet the server's own
// refusal and are listed as not saved, never sent; opening the game again starts it
// cleanly from the scheduled game the server now holds.
import { TrackerGameState } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  endpointNetwork,
  type EndpointNetwork,
} from '../features/tracker/endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from '../features/tracker/fetch-command-transport.ts';
import { createFetchTrackerServer } from '../features/tracker/fetch-tracker-server.ts';
import { createMemoryQueueStorage } from '../features/tracker/memory-queue-storage.ts';
import type { KeptTap } from '../features/tracker/queue-storage.ts';
import { createTrackerController, type TapInput } from '../features/tracker/tracker-controller.ts';
import { createManualClock } from '../features/tracker/tracker-queue.test-helper.ts';
import { markNotStartedRequest } from './not-started-endpoint.ts';
import { bears, games, hawks, liveLeagueId } from './tracker-endpoints.test-helper.ts';
import { trackerStateRequest } from './tracker-state-endpoint.ts';

const gameId = games.hawksBears;

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00e0${commandNumber.toString(16).padStart(8, '0')}`;
};

/** The scorekeeper's tablet: the controller over the endpoints. */
function tablet(network: EndpointNetwork) {
  const storage = createMemoryQueueStorage();
  const clock = createManualClock();
  const fetch = network.fetchAs('scorekeeper');
  const controller = createTrackerController({
    gameId,
    deviceId: 'tablet-1',
    storage,
    clock,
    wallClock: clock.now,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
  });
  return { controller, storage };
}

/** The game as the server holds it, read as the owner. */
async function serverGame(network: EndpointNetwork) {
  const context = await network.world.contextAs('owner', 'live', ['games', gameId, 'state']);
  const answer = await trackerStateRequest(context, gameId, network.world.tracker);
  return TrackerGameState.parse(answer.body) as { sequence: number; state: basketball.GameState };
}

/** The scorekeeper's phone marks the game not started. */
async function markFromPhone(network: EndpointNetwork, sequence: number) {
  const { world } = network;
  const context = await world.contextAs('scorekeeper', 'live', ['games', gameId, 'not-started']);
  const outcome = await markNotStartedRequest(
    context,
    gameId,
    { sequence },
    world.tracker,
    world.publishPlays,
  );
  await outcome.afterwards?.();
  return outcome.answer;
}

const tipOff: TapInput[] = [
  { type: 'lineup', side: 'home', playerIds: hawks },
  { type: 'lineup', side: 'away', playerIds: bears },
  { type: 'start' },
];
const basket: TapInput = { type: 'score', side: 'home', playerId: hawks[0] ?? '', points: 2 };
const inputOf = (kept: KeptTap) => kept.command.input;

async function tapAll(controller: ReturnType<typeof tablet>['controller'], inputs: TapInput[]) {
  for (const input of inputs) {
    const result = await controller.tap(input);
    if (!result.ok) throw new Error(`tap not taken: ${result.reason}`);
  }
}

describe('a game marked not started while a tablet has taps waiting', () => {
  it('lists the tablet’s waiting taps as not saved, never sends them, and starts again cleanly', async () => {
    const network = endpointNetwork();
    const { controller, storage } = tablet(network);
    await controller.start();
    await tapAll(controller, tipOff);
    await controller.idle();
    expect((await serverGame(network)).sequence).toBe(3);

    // The tablet loses the network with a basket and a pause not yet sent.
    network.mode = 'down';
    await tapAll(controller, [basket, { type: 'pause' }]);
    network.mode = 'up';

    // On the server only lineups and the start are recorded: the scorekeeper may clear it.
    const answer = await markFromPhone(network, 3);
    expect(answer).toMatchObject({ status: 200, body: { status: 'not-started', sequence: 4 } });

    controller.online();
    await controller.idle();
    const status = controller.status();
    // Its session was ended with the game ("released" now that nobody holds it).
    expect(status.mode).toEqual({ kind: 'read-only', reason: 'released' });
    expect(status.notSaved.map(inputOf)).toEqual([basket, { type: 'pause' }]);
    expect(status.queue.waiting).toBe(0);
    // None of them reached the game.
    const server = await serverGame(network);
    expect(server.sequence).toBe(4);
    expect(server.state).toMatchObject({ status: 'scheduled', plays: [] });
    // A tap made now is not taken: the device is not scoring.
    expect(await controller.tap(basket)).toEqual({ ok: false, reason: 'not-scoring' });

    // Opening the game again: a new session, the scheduled game, the old taps still
    // listed for the scorekeeper to enter again or dismiss, never sent.
    await controller.openAgain();
    await controller.idle();
    expect(controller.status().mode).toEqual({ kind: 'scoring' });
    expect(controller.status().game).toMatchObject({ status: 'scheduled', plays: [] });
    expect(controller.status().notSaved.map(inputOf)).toEqual([basket, { type: 'pause' }]);
    await tapAll(controller, tipOff);
    await controller.idle();
    const restarted = await serverGame(network);
    expect(restarted.sequence).toBe(7);
    expect(restarted.state.status).toBe('live');
    expect(basketball.derive(restarted.state).teams.home.score).toBe(0);
    await controller.dismissNotSaved();
    expect(await storage.list(gameId)).toEqual([]);
  });
});
