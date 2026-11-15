// Step 2.122 on the device: a scorekeeper's tracker gets the season's rules in the state
// it loads from the server (games.read_tracker_state), the one path it has, so the
// device's engine and the server's judge every tap by the same rules. A season with a
// foul limit of four marks a player out at four on the device and on the server; a
// device that reloads mid-game keeps the rules the game started with (S-1); and the
// clock-mode switch step 2.69 will draw is taken by the endpoint and saved (T-128).
import { seasonRulesPreset, TrackerGameState, type SeasonRules } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import { bears, games, hawks, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;
const [fouler = ''] = hawks;

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00d1${commandNumber.toString(16).padStart(8, '0')}`;
};

const withLimit = (limit: number | null): SeasonRules => {
  const rules = seasonRulesPreset('high-school');
  rules.fouls.playerFoulLimit = limit;
  return rules;
};

/** The made-up world, its season's rules set by `rulesNow` each time they are read. */
function networkWith(rulesNow: () => SeasonRules): EndpointNetwork {
  return endpointNetwork({
    deps: (deps) => ({
      ...deps,
      transaction: (context, work) =>
        deps.transaction(context, (tx) =>
          work({
            ...tx,
            games: {
              ...tx.games,
              findSeason: async (seasonId) => {
                const season = await tx.games.findSeason(seasonId);
                return season === undefined ? undefined : { ...season, rules: rulesNow() };
              },
            },
          }),
        ),
    }),
  });
}

function device(network: EndpointNetwork, deviceId = 'tablet-1') {
  const clock = createManualClock();
  const fetch: typeof globalThis.fetch = (input, init) =>
    network.fetchAs('scorekeeper')(input, init);
  return createTrackerController({
    gameId,
    deviceId,
    storage: createMemoryQueueStorage(),
    clock,
    wallClock: clock.now,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
  });
}

type Controller = ReturnType<typeof device>;

async function opened(controller: Controller): Promise<Controller> {
  await controller.start();
  await controller.idle();
  expect(controller.status().mode).toEqual({ kind: 'scoring' });
  return controller;
}

async function tapAll(controller: Controller, inputs: readonly TapInput[]) {
  for (const input of inputs) {
    const result = await controller.tap(input);
    if (!result.ok) throw new Error(`tap not taken: ${result.reason}`);
  }
}

/** The game as the server holds it, read as the owner. */
async function serverGame(network: EndpointNetwork): Promise<basketball.GameState> {
  const context = await network.world.contextAs('owner', 'live', ['games', gameId, 'state']);
  const answer = await trackerStateRequest(context, gameId, network.world.tracker);
  return TrackerGameState.parse(answer.body).state as basketball.GameState;
}

const shown = (controller: Controller): basketball.GameState => {
  const game = controller.status().game;
  if (game === null) throw new Error('no game on the device');
  return game;
};

const lineOf = (state: basketball.GameState, playerId: string) =>
  basketball.derive(state).players[playerId];

const tipOff: TapInput[] = [
  { type: 'lineup', side: 'home', playerIds: hawks },
  { type: 'lineup', side: 'away', playerIds: bears },
];
const foul: TapInput = { type: 'foul', side: 'home', playerId: fouler };

describe('the season’s rules on the scorekeeper’s device (step 2.122)', () => {
  it('a limit of four marks a player out at four, on the device at once and on the server', async () => {
    const network = networkWith(() => withLimit(4));
    const controller = await opened(device(network));
    expect(shown(controller).rules.playerFoulLimit).toBe(4);

    await tapAll(controller, [...tipOff, foul, foul, foul]);
    expect(lineOf(shown(controller), fouler)?.fouledOut).toBeUndefined();
    await tapAll(controller, [foul]);
    // Shown on the device before the server has answered.
    expect(lineOf(shown(controller), fouler)).toMatchObject({ fouls: 4, fouledOut: true });

    await controller.idle();
    expect(controller.status().notApplied).toEqual([]);
    const server = await serverGame(network);
    expect(lineOf(server, fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    expect(basketball.derive(shown(controller)).players).toEqual(basketball.derive(server).players);
    await controller.leave();
  });

  it('a device that reloads mid-game keeps the rules the game started with (S-1)', async () => {
    let rules = withLimit(4);
    const network = networkWith(() => rules);
    const first = await opened(device(network));
    await tapAll(first, [...tipOff, foul, foul]);
    await first.idle();
    await first.leave();

    // The admin raises the season's limit to six while the game is on.
    rules = withLimit(6);
    const again = await opened(device(network, 'tablet-2'));
    expect(shown(again).rules.playerFoulLimit).toBe(4);
    await tapAll(again, [foul, foul]);
    expect(lineOf(shown(again), fouler)?.fouledOut).toBe(true);
    await again.idle();
    expect(again.status().notApplied).toEqual([]);
    expect(lineOf(await serverGame(network), fouler)?.fouledOut).toBe(true);
    await again.leave();
  });

  it('the clock-mode switch is taken by the endpoint and saved', async () => {
    const network = networkWith(() => withLimit(4));
    const controller = await opened(device(network));
    await tapAll(controller, [
      ...tipOff,
      { type: 'start' },
      { type: 'clock-mode', mode: 'running' },
    ]);
    expect(basketball.derive(shown(controller)).clockMode).toBe('running');
    await controller.idle();
    expect(controller.status().notApplied).toEqual([]);
    const server = await serverGame(network);
    expect(server.plays.at(-1)).toMatchObject({ type: 'clock-mode', mode: 'running' });
    expect(basketball.derive(server).clockMode).toBe('running');
    await controller.leave();
  });
});
