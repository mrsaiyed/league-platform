// Step 2.37 on the controller, against the real endpoints in this process (the web app's
// made-up stand-in): Undo and Redo, End game, taking an unsent End back, reopening and
// marking not started. For each: what is sent, what happens with plays waiting, and what
// happens with no connection.
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
import { createFetchGameDoors } from './fetch-game-doors.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;
const [hawk = ''] = hawks;
const [bear = ''] = bears;

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00e7${commandNumber.toString(16).padStart(8, '0')}`;
};

function device(network: EndpointNetwork, as: Person = 'scorekeeper') {
  const storage = createMemoryQueueStorage();
  const clock = createManualClock();
  const fetch = network.fetchAs(as);
  const at = { leagueId: liveLeagueId, gameId, fetch };
  const controller = createTrackerController({
    gameId,
    deviceId: 'tablet-1',
    storage,
    clock,
    wallClock: clock.now,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport(at),
    server: createFetchTrackerServer(at),
    doors: createFetchGameDoors(at),
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
  { type: 'start' },
];
const basket = (side: 'home' | 'away', points: 1 | 2 | 3 = 2): TapInput => ({
  type: 'score',
  side,
  playerId: side === 'home' ? hawk : bear,
  points,
});
const foul: TapInput = { type: 'foul', side: 'home', playerId: hawk };

type Device = ReturnType<typeof device>;

async function tapAll({ controller }: Device, inputs: TapInput[]) {
  for (const input of inputs) {
    const result = await controller.tap(input);
    if (!result.ok) throw new Error(`tap not taken: ${JSON.stringify(result)}`);
  }
}

/** A device scoring a game under way: both lineups, the clock started, all saved. */
async function scoring(network: EndpointNetwork, as: Person = 'scorekeeper') {
  const tablet = device(network, as);
  await tablet.controller.start();
  await tapAll(tablet, tipOff);
  await tablet.controller.idle();
  return tablet;
}

const sent = (network: EndpointNetwork) => network.reached.filter((r) => !r.includes('session'));

describe('tracker controller: Undo and Redo (checklist I1, I2)', () => {
  it('takes the latest play back and puts it back, on the device at once and on the server', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home'), basket('away', 3)]);
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 3 });

    await tapAll(tablet, [{ type: 'undo' }]);
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 0 });
    expect(tablet.controller.status().game?.redo).toHaveLength(1);
    await tablet.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 0 });

    await tapAll(tablet, [{ type: 'redo' }]);
    await tablet.controller.idle();
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 2, away: 3 });
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 2, away: 3 });
    expect(tablet.controller.status().queue.waiting).toBe(0);
  });

  it('with nothing to undo or redo the engine says no on the device and nothing is sent', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    const before = sent(network).length;
    expect(await tablet.controller.tap({ type: 'undo' })).toMatchObject({
      ok: false,
      reason: 'engine',
      message: 'Nothing to undo.',
    });
    expect(await tablet.controller.tap({ type: 'redo' })).toMatchObject({
      ok: false,
      reason: 'engine',
      message: 'Nothing to redo.',
    });
    await tablet.controller.idle();
    expect(sent(network).filter((r) => r.startsWith('POST commands'))).toHaveLength(
      sent(network)
        .slice(0, before)
        .filter((r) => r.startsWith('POST commands')).length,
    );
  });

  it('with no connection an undo waits behind the play it takes back, and both are saved in order', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    network.mode = 'down';
    await tapAll(tablet, [basket('home'), { type: 'undo' }, basket('away')]);
    // Shown at once, with nothing sent.
    expect(scoreOf(tablet.controller.status().game)).toEqual({ home: 0, away: 2 });
    expect(tablet.controller.status().waiting.map((t) => t.command.input.type)).toEqual([
      'score',
      'undo',
      'score',
    ]);
    network.mode = 'up';
    tablet.controller.online();
    await tablet.controller.idle();
    expect(tablet.controller.status().queue.waiting).toBe(0);
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 0, away: 2 });
  });

  it('undoing a foul that stopped the clock takes the foul back and leaves the clock stopped; a period change undone puts the clock back', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    // A stop clock, so a foul stops it.
    await tapAll(tablet, [{ type: 'clock-mode', mode: 'stop' }, ...tipOff]);
    await tablet.clock.advance(5_000);
    await tapAll(tablet, [foul]);
    const fouled = tablet.controller.status().game;
    expect(fouled?.plays.at(-1)).toMatchObject({ type: 'foul', stoppedClock: true });
    expect(fouled?.clock.running).toBe(false);
    await tapAll(tablet, [{ type: 'undo' }]);
    const undone = tablet.controller.status().game;
    expect(undone?.plays.at(-1)?.type).not.toBe('foul');
    // Undo never touches the clock (I2): the scorekeeper starts it again.
    expect(undone?.clock.running).toBe(false);
    expect(undone?.clock.remainingMs).toBe(fouled?.clock.remainingMs);

    await tapAll(tablet, [{ type: 'period', period: 2 }]);
    expect(tablet.controller.status().game?.clock.remainingMs).not.toBe(fouled?.clock.remainingMs);
    await tapAll(tablet, [{ type: 'undo' }]);
    expect(tablet.controller.status().game?.clock.remainingMs).toBe(fouled?.clock.remainingMs);
    await tablet.controller.idle();
    // On the server too the period change is gone (its own clock times the taps here).
    const server = (await serverGame(network)).state;
    expect(server.plays.some((play) => play.type === 'period')).toBe(false);
    expect(server.redo.at(-1)?.type).toBe('period');
  });
});

describe('tracker controller: End game (checklist J1 to J3)', () => {
  it('ends the game on the device at once and on the server, where it is final with its score', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home'), { type: 'end' }]);
    expect(tablet.controller.status().game?.status).toBe('final');
    // Still waiting: the screen offers "Take back End game" until the server has it.
    expect(tablet.controller.status().waiting.some((t) => t.command.input.type === 'end')).toBe(
      true,
    );
    await tablet.controller.idle();
    expect(tablet.controller.status().waiting).toEqual([]);
    const server = await serverGame(network);
    expect(server.state.status).toBe('final');
    expect(scoreOf(server.state)).toEqual({ home: 2, away: 0 });
  });

  it('a game with nothing recorded is not ended: the engine says no on the device (J2)', async () => {
    const network = endpointNetwork();
    const tablet = device(network);
    await tablet.controller.start();
    expect(await tablet.controller.tap({ type: 'end' })).toMatchObject({
      ok: false,
      reason: 'engine',
      message: 'Nothing is recorded for this game yet.',
    });
  });

  it('a level score is refused by the server; the game is live again and the refusal can be dismissed alone (J3)', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home'), basket('away'), { type: 'end' }]);
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.game?.status).toBe('live');
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.notApplied).toHaveLength(1);
    expect(status.notApplied[0]?.command.input).toEqual({ type: 'end' });
    expect(status.notApplied[0]?.refusal.message).toMatch(/level/);
    expect((await serverGame(network)).state.status).toBe('live');

    await tablet.controller.dismissNotApplied(['not-this-one']);
    expect(tablet.controller.status().notApplied).toHaveLength(1);
    await tablet.controller.dismissNotApplied([status.notApplied[0]?.command.commandId ?? '']);
    expect(tablet.controller.status().notApplied).toEqual([]);
    // And the game is scored on.
    await tapAll(tablet, [basket('home')]);
    await tablet.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 4, away: 2 });
  });
});

describe('tracker controller: taking back an End the server does not have', () => {
  it('with no connection: the End is dropped on the device, nothing of it is ever sent, and the game is scored on', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home')]);
    await tablet.controller.idle();
    network.mode = 'down';
    await tablet.clock.advance(4_000);
    await tapAll(tablet, [{ type: 'end' }]);
    expect(tablet.controller.status().game?.status).toBe('final');

    expect(await tablet.controller.takeBackEnd()).toEqual({ ok: true });
    const back = tablet.controller.status().game;
    expect(back?.status).toBe('live');
    expect(scoreOf(back ?? null)).toEqual({ home: 2, away: 0 });
    // The clock was running at the End: it stays stopped where the End found it.
    expect(back?.clock.running).toBe(false);
    expect(tablet.controller.status().waiting.map((t) => t.command.input.type)).toEqual(['pause']);

    await tapAll(tablet, [basket('away', 3)]);
    network.mode = 'up';
    tablet.controller.online();
    await tablet.controller.idle();
    const server = await serverGame(network);
    expect(server.state.status).toBe('live');
    expect(scoreOf(server.state)).toEqual({ home: 2, away: 3 });
    expect(server.state.clock.running).toBe(false);
    expect(tablet.controller.status().queue.waiting).toBe(0);
  });

  it('with plays waiting in front of it, only the End goes: the plays are still sent', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    network.mode = 'down';
    await tapAll(tablet, [{ type: 'pause' }, basket('home'), basket('home'), { type: 'end' }]);
    expect(await tablet.controller.takeBackEnd()).toEqual({ ok: true });
    expect(tablet.controller.status().waiting.map((t) => t.command.input.type)).toEqual([
      'pause',
      'score',
      'score',
    ]);
    network.mode = 'up';
    tablet.controller.online();
    await tablet.controller.idle();
    const server = await serverGame(network);
    expect(server.state.status).toBe('live');
    expect(scoreOf(server.state)).toEqual({ home: 4, away: 0 });
  });

  it('once the server has the End nothing is taken back: Reopen is the way', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home'), { type: 'end' }]);
    await tablet.controller.idle();
    expect(await tablet.controller.takeBackEnd()).toEqual({ ok: false, reason: 'already-saved' });
    expect(tablet.controller.status().game?.status).toBe('final');
    expect((await serverGame(network)).state.status).toBe('final');
  });

  it('an End the server took while its answer was lost: the device cannot know, and the next play finds the game over, listed as not saved', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home')]);
    await tablet.controller.idle();
    network.mode = 'answers-lost';
    await tapAll(tablet, [{ type: 'end' }]);
    await tablet.controller.idle();
    // The device still holds its End as waiting, so it lets it be taken back.
    expect(await tablet.controller.takeBackEnd()).toEqual({ ok: true });
    network.mode = 'up';
    expect((await serverGame(network)).state.status).toBe('final');
    // The truth comes with the next play: the server turns it away (the game is over
    // there), it is listed as a play that did not go in, never lost silently, and the
    // final game is shown, from where Reopen is offered.
    await tablet.controller.tap(basket('away'));
    tablet.controller.online();
    await tablet.controller.idle();
    const status = tablet.controller.status();
    expect(status.game?.status).toBe('final');
    const listed = [
      ...status.notApplied.map((r) => r.command.input.type),
      ...status.notSaved.map((t) => t.command.input.type),
    ];
    expect(listed).toContain('score');
    expect(status.queue.waiting).toBe(0);
  });

  it('a game that was not ended has nothing to take back', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    expect(await tablet.controller.takeBackEnd()).toEqual({ ok: false, reason: 'not-waiting' });
  });
});

describe('tracker controller: Reopen (step 2.120; the review of the two doors, points 1 and 4)', () => {
  /** A game ended and saved, a home basket ahead. */
  async function ended(network: EndpointNetwork) {
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home'), { type: 'end' }]);
    await tablet.controller.idle();
    return tablet;
  }

  it('says Reopen is offered to the scorekeeper who ended it, until a time', async () => {
    const network = endpointNetwork();
    const tablet = await ended(network);
    const offer = await tablet.controller.reopenOffer();
    expect(offer?.reopen.when).toBe('until');
    network.mode = 'down';
    expect(await tablet.controller.reopenOffer()).toBeNull();
  });

  it('reopened at once (inside the first half minute) the same screen carries on: scoring, live, and the next basket is saved', async () => {
    const network = endpointNetwork();
    const tablet = await ended(network);
    const modes: string[] = [];
    tablet.controller.subscribe((status) => modes.push(status.mode.kind));

    expect(await tablet.controller.reopen('End game tapped by mistake')).toEqual({ ok: true });
    const status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.game?.status).toBe('live');
    expect(scoreOf(status.game)).toEqual({ home: 2, away: 0 });
    // Never "opening", never read-only: nothing told the scorekeeper "game over".
    expect(new Set(modes)).toEqual(new Set(['scoring']));
    // What was sent: one reopen, with the number of the last tap the server took.
    expect(sent(network).filter((r) => r.endsWith('reopen'))).toEqual(['POST reopen']);

    await tapAll(tablet, [basket('away', 3)]);
    await tablet.controller.idle();
    const server = await serverGame(network);
    expect(server.state.status).toBe('live');
    expect(scoreOf(server.state)).toEqual({ home: 2, away: 3 });
    expect(tablet.controller.status().queue.waiting).toBe(0);
  });

  it('reopened after the device was told the game is over, it scores again with no reload', async () => {
    const network = endpointNetwork();
    const tablet = await ended(network);
    // The next renewal finds the game over.
    await tablet.clock.advance(31_000);
    await tablet.controller.idle();
    expect(tablet.controller.status().mode).toEqual({
      kind: 'read-only',
      reason: 'game-not-live',
    });
    expect(tablet.controller.status().game?.status).toBe('final');

    expect(await tablet.controller.reopen('End game tapped by mistake')).toEqual({ ok: true });
    expect(tablet.controller.status().mode).toEqual({ kind: 'scoring' });
    await tapAll(tablet, [basket('home')]);
    await tablet.controller.idle();
    expect(scoreOf((await serverGame(network)).state)).toEqual({ home: 4, away: 0 });
  });

  it('with no connection it says so, changes nothing, and asking again reopens once', async () => {
    const network = endpointNetwork();
    const tablet = await ended(network);
    network.mode = 'down';
    expect(await tablet.controller.reopen('By mistake')).toEqual({
      ok: false,
      reason: 'unanswered',
    });
    expect(tablet.controller.status().game?.status).toBe('final');
    // The answer lost on the way: the server reopened, the device asks again with the
    // same request and is told "reopened" again.
    network.mode = 'answers-lost';
    expect(await tablet.controller.reopen('By mistake')).toEqual({
      ok: false,
      reason: 'unanswered',
    });
    network.mode = 'up';
    expect(await tablet.controller.reopen('By mistake')).toEqual({ ok: true });
    expect(tablet.controller.status().game?.status).toBe('live');
    expect((await serverGame(network)).state.status).toBe('live');
  });

  it('while the End is still waiting to send it is not asked: taking the End back is the way', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home')]);
    await tablet.controller.idle();
    network.mode = 'down';
    await tapAll(tablet, [{ type: 'end' }]);
    const before = sent(network).length;
    expect(await tablet.controller.reopen('By mistake')).toEqual({
      ok: false,
      reason: 'plays-waiting',
    });
    expect(
      sent(network)
        .slice(before)
        .some((r) => r.endsWith('reopen')),
    ).toBe(false);
  });

  it('another scorekeeper is refused in the server’s own code, with who ended it', async () => {
    const network = endpointNetwork();
    await ended(network);
    // The owner did not end it, but may correct games: always offered. A device that
    // never scored the game has no game loaded, and offers nothing (part 2 loads it).
    const other = device(network, 'owner');
    await other.controller.start();
    expect((await other.controller.reopenOffer())?.reopen).toEqual({ when: 'always' });
    expect(await other.controller.reopen('By mistake')).toEqual({
      ok: false,
      reason: 'not-offered',
    });
  });
});

describe('tracker controller: Mark not started (step 2.121; point 1)', () => {
  it('with only lineups and the clock recorded, the scorekeeper clears the game and picks lineups again on the same screen', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    const modes: string[] = [];
    tablet.controller.subscribe((status) => modes.push(status.mode.kind));

    expect(await tablet.controller.markNotStarted()).toEqual({ ok: true });
    const status = tablet.controller.status();
    expect(status.mode).toEqual({ kind: 'scoring' });
    expect(status.game).toMatchObject({ status: 'scheduled', plays: [] });
    expect(new Set(modes)).toEqual(new Set(['scoring']));
    expect((await serverGame(network)).state).toMatchObject({ status: 'scheduled', plays: [] });

    // The try-out night: lineups again, and they are saved.
    await tapAll(tablet, tipOff);
    await tablet.controller.idle();
    expect((await serverGame(network)).state.status).toBe('live');
    expect(tablet.controller.status().queue.waiting).toBe(0);
  });

  it('with a basket standing a scorekeeper is refused (undo it first); undone, the game is cleared', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    await tapAll(tablet, [basket('home')]);
    expect(await tablet.controller.markNotStarted()).toEqual({
      ok: false,
      reason: 'refused',
      code: 'plays-recorded',
    });
    expect(tablet.controller.status().game?.status).toBe('live');
    await tapAll(tablet, [{ type: 'undo' }]);
    expect(await tablet.controller.markNotStarted()).toEqual({ ok: true });
    expect((await serverGame(network)).state).toMatchObject({ status: 'scheduled', plays: [] });
  });

  it('waits for plays waiting to send; with no connection it says so and clears nothing', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    network.mode = 'down';
    await tapAll(tablet, [{ type: 'pause' }]);
    expect(await tablet.controller.markNotStarted()).toEqual({
      ok: false,
      reason: 'plays-waiting',
    });
    network.mode = 'up';
    // The waiting tap goes first, then the door is asked with the number after it.
    expect(await tablet.controller.markNotStarted()).toEqual({ ok: true });
    expect((await serverGame(network)).state.status).toBe('scheduled');
  });

  it('with nothing waiting and no connection it answers "unanswered" and the game stays', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    network.mode = 'down';
    expect(await tablet.controller.markNotStarted()).toEqual({ ok: false, reason: 'unanswered' });
    expect(tablet.controller.status().game?.status).toBe('live');
  });

  it('no tap is taken while a door is being gone through', async () => {
    const network = endpointNetwork();
    const tablet = await scoring(network);
    const marking = tablet.controller.markNotStarted();
    expect(await tablet.controller.tap(basket('home'))).toEqual({
      ok: false,
      reason: 'not-scoring',
    });
    expect(await marking).toEqual({ ok: true });
  });

  it('a device with no doors offers neither', async () => {
    const network = endpointNetwork();
    const fetch = network.fetchAs('scorekeeper');
    const at = { leagueId: liveLeagueId, gameId, fetch };
    const clock = createManualClock();
    const controller = createTrackerController({
      gameId,
      deviceId: 'tablet-2',
      storage: createMemoryQueueStorage(),
      clock,
      wallClock: clock.now,
      newCommandId,
      transport: createFetchCommandTransport(at),
      server: createFetchTrackerServer(at),
    });
    await controller.start();
    expect(await controller.markNotStarted()).toEqual({ ok: false, reason: 'not-offered' });
    expect(await controller.reopen('x')).toEqual({ ok: false, reason: 'not-offered' });
    expect(await controller.reopenOffer()).toBeNull();
  });
});
