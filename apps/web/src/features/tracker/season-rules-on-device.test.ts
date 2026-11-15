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

/** How a load of the state is answered: as asked, or held back, late or lost in a test. */
type StateAnswer = (answer: () => Promise<Response>) => Promise<Response>;

function device(
  network: EndpointNetwork,
  deviceId = 'tablet-1',
  stateAnswer: StateAnswer = (answer) => answer(),
  clock = createManualClock(),
) {
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const answer = () => network.fetchAs('scorekeeper')(input, init);
    return String(input).endsWith('/state') ? stateAnswer(answer) : answer();
  };
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

describe('the season changed after the device loaded the game, before tip-off (record 062)', () => {
  /** The same board on the device and on the server, and nothing refused. */
  async function sameAsServer(controller: Controller, network: EndpointNetwork) {
    await controller.idle();
    expect(controller.status().notApplied).toEqual([]);
    expect(controller.status().waiting).toEqual([]);
    const server = await serverGame(network);
    expect(shown(controller).rules).toEqual(server.rules);
    expect(shown(controller).plays).toEqual(server.plays);
    expect(basketball.derive(shown(controller)).players).toEqual(basketball.derive(server).players);
    return server;
  }

  it('a limit lowered from six to four: the device takes the server’s at the first batch, and both mark the player out', async () => {
    let rules = withLimit(6);
    const network = networkWith(() => rules);
    const controller = await opened(device(network));
    expect(shown(controller).rules.playerFoulLimit).toBe(6);
    rules = withLimit(4);
    await tapAll(controller, [...tipOff, foul, foul, foul, foul]);
    const server = await sameAsServer(controller, network);
    expect(server.rules.playerFoulLimit).toBe(4);
    expect(lineOf(shown(controller), fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    await controller.leave();
  });

  it('a mercy lead set meanwhile: the device’s clock switches with the server’s, and its next start is not refused', async () => {
    let rules = seasonRulesPreset('high-school');
    const network = networkWith(() => rules);
    const controller = await opened(device(network));
    rules = seasonRulesPreset('high-school');
    rules.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: 6 };
    const three: TapInput = { type: 'score', side: 'home', playerId: fouler, points: 3 };
    await tapAll(controller, [...tipOff, { type: 'start' }]);
    await controller.idle();
    await tapAll(controller, [three, three]);
    expect(basketball.derive(shown(controller)).clockMode).toBe('running');
    // Under the running clock the whistle does not stop it, so there is no start to refuse.
    await tapAll(controller, [{ type: 'foul', side: 'away', playerId: bears[0] ?? '' }]);
    expect(shown(controller).clock.running).toBe(true);
    await sameAsServer(controller, network);
    await controller.leave();
  });

  it('taps made while that load is under way are neither lost nor counted twice', async () => {
    let rules = withLimit(6);
    const network = networkWith(() => rules);
    let release: () => void = () => {};
    let holding = false;
    const held: StateAnswer = async (answer) => {
      if (holding) await new Promise<void>((resolve) => (release = resolve));
      return answer();
    };
    const controller = await opened(device(network, 'tablet-1', held));
    rules = withLimit(4);
    holding = true;
    await tapAll(controller, tipOff);
    // The server has taken the line-ups; the load they asked for is held back.
    await tapAll(controller, [foul, foul, foul, foul]);
    holding = false;
    release();
    const server = await sameAsServer(controller, network);
    expect(lineOf(server, fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    expect(server.plays.filter((p) => p.type === 'foul')).toHaveLength(4);
    await controller.leave();
  });

  it('a device that tipped off offline converges at its first batch once back', async () => {
    let rules = withLimit(6);
    const network = networkWith(() => rules);
    const controller = await opened(device(network));
    network.mode = 'down';
    rules = withLimit(4);
    await tapAll(controller, [...tipOff, foul, foul, foul, foul]);
    // Offline its own picture is the rules it loaded: not out yet.
    expect(lineOf(shown(controller), fouler)?.fouledOut).toBeUndefined();
    network.mode = 'up';
    controller.online();
    await sameAsServer(controller, network);
    expect(lineOf(shown(controller), fouler)?.fouledOut).toBe(true);
    await controller.leave();
  });

  it('nothing changes for a game already under way: no further loads', async () => {
    let rules = withLimit(4);
    const network = networkWith(() => rules);
    const controller = await opened(device(network));
    await tapAll(controller, [...tipOff, foul]);
    await controller.idle();
    const loads = network.reached.filter((r) => r === 'GET state').length;
    rules = withLimit(2);
    await tapAll(controller, [foul, foul, foul]);
    await controller.idle();
    expect(network.reached.filter((r) => r === 'GET state')).toHaveLength(loads);
    const server = await sameAsServer(controller, network);
    expect(server.rules.playerFoulLimit).toBe(4);
    await controller.leave();
  });

  it('a load for the start that gets no answer is asked again later, though no batch follows', async () => {
    let rules = withLimit(6);
    const network = networkWith(() => rules);
    let lose = false;
    const lossy: StateAnswer = async (answer) => {
      if (!lose) return answer();
      lose = false;
      throw new TypeError('Failed to fetch');
    };
    const clock = createManualClock();
    const controller = await opened(device(network, 'tablet-1', lossy, clock));
    // Every tap goes in one batch, the last one: the load after it is lost.
    network.mode = 'down';
    rules = withLimit(4);
    await tapAll(controller, [...tipOff, foul, foul, foul, foul]);
    lose = true;
    network.mode = 'up';
    controller.online();
    await controller.idle();
    expect(lose).toBe(false);
    expect(controller.status().waiting).toEqual([]);
    expect(lineOf(shown(controller), fouler)?.fouledOut).toBeUndefined();
    // Asked again after a wait, by itself.
    await clock.advance(60_000);
    await sameAsServer(controller, network);
    expect(lineOf(shown(controller), fouler)?.fouledOut).toBe(true);
    await controller.leave();
  });
});

/** Waits, a few milliseconds at a time, until `done` holds. */
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(done()).toBe(true);
}

describe('two loads answered out of order', () => {
  it('the older answer, arriving last, is left: no tap the server took leaves the screen', async () => {
    const network = networkWith(() => withLimit(4));
    let holdNext = false;
    let release: () => void = () => {};
    const late: StateAnswer = async (answer) => {
      const answered = await answer();
      if (holdNext) {
        holdNext = false;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return answered;
    };
    const controller = await opened(device(network, 'tablet-1', late));
    const basket = (points: 1 | 2 | 3): TapInput => ({
      type: 'score',
      side: 'home',
      playerId: fouler,
      points,
    });
    // Someone on neither team: the device's engine takes it, the server refuses it.
    const stranger: TapInput = {
      type: 'score',
      side: 'home',
      playerId: '01900000-0000-7000-8000-00000000dead',
      points: 2,
    };
    await tapAll(controller, [...tipOff, basket(2)]);
    await controller.idle();
    const before = controller.status().serverSequence ?? 0;

    // The reload after this refusal is answered by the server, then held on its way.
    holdNext = true;
    await tapAll(controller, [stranger]);
    await until(() => !holdNext);
    // A basket the server takes, and another refusal, whose reload arrives at once.
    await tapAll(controller, [basket(3), stranger]);
    await until(() => (controller.status().serverSequence ?? 0) > before);
    const newer = controller.status().serverSequence;
    expect(basketball.derive(shown(controller)).teams.home.score).toBe(5);

    // The older answer lands last: it is left.
    release();
    await controller.idle();
    expect(controller.status().serverSequence).toBe(newer);
    expect(basketball.derive(shown(controller)).teams.home.score).toBe(5);
    expect(basketball.derive(await serverGame(network)).teams.home.score).toBe(5);
    await controller.leave();
  });
});
