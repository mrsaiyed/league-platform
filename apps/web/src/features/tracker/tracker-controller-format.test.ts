// Step 2.119 on the controller, against the real endpoints in this process (the web app's
// made-up stand-in): once "Change the format" is saved at the start confirmation, the device
// reads the game's state again (`formatChanged`), so it plays the new rules before the first
// play, as the server does; until then it keeps the rules it read.
import { GameFormatReply, type GameFormatView } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import {
  changeGameFormatRequest,
  readGameFormatRequest,
} from '../../server/game-format-endpoint.ts';
import { standInPlayerId } from '../../server/stand-in-games.ts';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import { games, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchGameDoors } from './fetch-game-doors.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

/** Lions v Tigers, scheduled, the scorekeeper's (Hawks v Bears is already under way). */
const gameId = games.lionsTigers;
const lions = [1, 2, 3, 4, 5].map((n) => standInPlayerId(1, n));
const tigers = [1, 2, 3, 4, 5].map((n) => standInPlayerId(2, n));

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00f9${commandNumber.toString(16).padStart(8, '0')}`;
};

function device(network: EndpointNetwork) {
  const clock = createManualClock();
  const at = { leagueId: liveLeagueId, gameId, fetch: network.fetchAs('scorekeeper') };
  return createTrackerController({
    gameId,
    deviceId: 'format-tablet',
    storage: createMemoryQueueStorage(),
    clock,
    wallClock: clock.now,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport(at),
    server: createFetchTrackerServer(at),
    doors: createFetchGameDoors(at),
    queue: { reachable: () => network.mode !== 'down' },
  });
}

/** Eight-minute quarters, saved for this game only as the scorekeeper at the table. */
async function quartersAtTheTable(network: EndpointNetwork) {
  const parts = ['games', gameId, 'format'];
  const context = await network.world.contextAs('scorekeeper', 'live', parts);
  const read = GameFormatReply.parse(
    (await readGameFormatRequest(context, gameId, network.world.tracker)).body,
  );
  if (read.status !== 'format') throw new Error(`refused: ${read.code}`);
  const view: GameFormatView = read.view;
  const format = {
    ...view.applies,
    gameFormat: { ...view.applies.gameFormat, periods: 4 as const, periodSeconds: 480 },
  };
  const saved = await changeGameFormatRequest(
    context,
    gameId,
    { version: view.version, format },
    network.world.tracker,
  );
  expect(saved.status).toBe(200);
}

async function serverRules(network: EndpointNetwork) {
  const context = await network.world.contextAs('owner', 'live', ['games', gameId, 'state']);
  const answer = await trackerStateRequest(context, gameId, network.world.tracker);
  const body = answer.body as { state: { rules: { periods: number; periodSeconds: number } } };
  return body.state.rules;
}

const tipOff: TapInput[] = [
  { type: 'lineup', side: 'home', playerIds: lions },
  { type: 'lineup', side: 'away', playerIds: tigers },
  { type: 'start' },
];

describe('tracker controller: the format changed before the first play (step 2.119)', () => {
  it('reads the game again, so the device plays the new rules, as the server does', async () => {
    const network = endpointNetwork();
    const controller = device(network);
    await controller.start();
    const before = controller.status().game?.rules;
    expect(before?.periods).toBe(2);

    await quartersAtTheTable(network);
    // Until it is told, the device keeps what it read.
    expect(controller.status().game?.rules.periods).toBe(2);
    await controller.formatChanged();
    expect(controller.status().game?.rules).toMatchObject({ periods: 4, periodSeconds: 480 });

    for (const input of tipOff) expect((await controller.tap(input)).ok).toBe(true);
    await controller.idle();
    expect(await serverRules(network)).toMatchObject({ periods: 4, periodSeconds: 480 });
    expect(controller.status().game?.rules).toMatchObject({ periods: 4, periodSeconds: 480 });
    expect(controller.status().queue.waiting).toBe(0);
  });
});
