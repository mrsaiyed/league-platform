// The game clock on devices whose own clocks are wrong (step 2.36's done test; finding M1
// of the 2.107 audit; T-121). Every clock here is controlled by the test. A tablet whose
// clock is 30 seconds slow, one 30 seconds fast and a correct one each open the game on
// the real controller, tap Start at the same moment and read the clock the way the
// scoring screen does (`readClock(game, status.now())`): all three read the same.
// And the taps a device kept while it had no connection are timed the same way, so the
// server, playing them late, ends with the same clock and the same minutes (T6 §4).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { minutesNow, readClock } from './game-clock.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { awayFive, homeFive } from './scoring-test-game.test-helper.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import {
  createFakeServer,
  createManualClock,
  type FakeServer,
  type ManualClock,
} from './tracker-queue.test-helper.ts';
import type { TrackerServer } from './tracker-server.ts';

const gameId = '01900000-0000-7000-8000-006a00000002';
/** The server's time when the test begins. */
const serverStart = 1_900_000_000_000;

/** The game the server's engine holds: each tap it saved, once, at the time it was tapped. */
function playedOnServer(sends: FakeServer): basketball.GameState {
  const sent = new Map(
    sends.received.flatMap((batch) => batch.commands).map((c) => [c.commandId, c]),
  );
  let state = basketball.newGame(basketball.QUARTERS, 0);
  for (const commandId of sends.saved) {
    const command = sent.get(commandId);
    if (command === undefined) throw new Error(`the server saved ${commandId} unseen`);
    state = basketball.apply(state, command.input as basketball.Command, {
      id: commandId,
      now: command.at,
    });
  }
  return state;
}

/**
 * A device whose own clock is `wrongMs` away from the server's (below zero: slow). The
 * server stamps each session reply with its own time; the reply takes 20 ms each way.
 */
function device(name: string, wrongMs: number) {
  const clock = createManualClock(serverStart + wrongMs);
  const serverNow = () => clock.now() - wrongMs;
  const server: TrackerServer = {
    session: () =>
      new Promise((resolve) => {
        clock.after(20, () => {
          const sentAt = serverNow();
          const value = {
            status: 'held-by-you' as const,
            sessionId: '01900000-0000-7000-8000-0000000000c1',
            expiresAt: sentAt + 120_000,
            sentAt,
          };
          clock.after(20, () => resolve({ kind: 'answer', value } as const));
        });
      }),
    // The game as the server holds it: every tap it has saved, played at its own time.
    loadState: async () => {
      const state = playedOnServer(sends);
      return { kind: 'answer', value: { sequence: sends.saved.length, state } };
    },
  };
  const sends = createFakeServer(clock);
  let commandNumber = 0;
  const controller = createTrackerController({
    gameId,
    deviceId: name,
    storage: createMemoryQueueStorage(),
    transport: sends.transport,
    server,
    clock,
    wallClock: clock.now,
    newCommandId: () => {
      commandNumber += 1;
      return `01900000-0000-7000-8000-00c0${commandNumber.toString(16).padStart(8, '0')}`;
    },
    random: () => 1,
  });
  const game = () => {
    const shown = controller.status().game;
    if (shown === null) throw new Error(`${name} has not opened the game`);
    return shown;
  };
  return {
    name,
    clock,
    controller,
    sends,
    serverNow,
    game,
    /** The clock as the scoring screen paints it: from the server's time. */
    shown: () => readClock(game(), controller.status().now()),
    /** The clock as a screen painting from the device's own time would read it. */
    byItsOwnClock: () => readClock(game(), clock.now()),
    async tap(input: TapInput) {
      const result = await controller.tap(input);
      if (!result.ok) throw new Error(`${name}: tap not taken (${result.reason})`);
    },
  };
}

/** Moves a device's clock on a little at a time until `work` is done. */
async function until(clock: ManualClock, work: Promise<unknown>) {
  let done = false;
  void work.finally(() => (done = true)).catch(() => undefined);
  for (let step = 0; step < 500 && !done; step += 1) await clock.advance(10);
  await work;
}

const lineups: readonly TapInput[] = [
  { type: 'lineup', side: 'home', playerIds: homeFive },
  { type: 'lineup', side: 'away', playerIds: awayFive },
];

describe('the game clock on a device whose own clock is wrong (finding M1)', () => {
  it('30 seconds slow, 30 seconds fast and correct: all three show the same clock', async () => {
    const devices = [device('correct', 0), device('slow', -30_000), device('fast', 30_000)];
    for (const d of devices) {
      await until(d.clock, d.controller.start());
      await until(d.clock, d.controller.idle());
      expect(d.controller.status().mode).toEqual({ kind: 'scoring' });
      // The server's time, to the millisecond: the reply took as long each way.
      expect(d.controller.status().now()).toBe(d.serverNow());
    }
    // Every device is at the same moment of the server's time before Start is tapped.
    const moment = Math.max(...devices.map((d) => d.serverNow()));
    for (const d of devices) await d.clock.advance(moment - d.serverNow());
    for (const d of devices) {
      for (const input of lineups) await d.tap(input);
      await d.tap({ type: 'start' });
    }
    // 65 seconds of play.
    for (const d of devices) await d.clock.advance(65_000);
    const [correct, slow, fast] = devices.map((d) => d.shown());
    expect(correct?.text).toBe('6:55');
    expect(slow).toEqual(correct);
    expect(fast).toEqual(correct);
    for (const d of devices) expect(d.shown().running).toBe(true);
    // A screen that painted from the device's own clock would be wrong by those 30
    // seconds: the slow tablet's clock would still stand at 8:00 for half a minute.
    const [, slowDevice, fastDevice] = devices;
    expect(slowDevice?.byItsOwnClock().text).toBe('7:25');
    expect(fastDevice?.byItsOwnClock().text).toBe('6:25');
    // The minutes of a player on the court tick with the same clock.
    for (const d of devices) {
      const base = basketball.derive(d.game()).players[homeFive[0] ?? '']?.ms ?? -1;
      expect(minutesNow(d.game(), d.shown(), base, true)).toBe('1:05');
    }
    // Paused at the same moment, the three stop on the same time.
    for (const d of devices) await d.tap({ type: 'pause' });
    for (const d of devices) await d.clock.advance(40_000);
    for (const d of devices) {
      expect(d.shown()).toMatchObject({ text: '6:55', running: false });
      await until(d.clock, d.controller.leave());
    }
  });

  it('a clock set wrongly is put right by setting it again, on a wrong device too (M2)', async () => {
    const d = device('slow', -30_000);
    await until(d.clock, d.controller.start());
    await until(d.clock, d.controller.idle());
    for (const input of lineups) await d.tap(input);
    await d.tap({ type: 'start' });
    await d.clock.advance(90_000);
    await d.tap({ type: 'score', side: 'home', playerId: homeFive[0] ?? '', points: 2 });
    await d.tap({ type: 'set-clock', ms: 7 * 60_000 });
    expect(d.shown()).toMatchObject({ text: '7:00', running: false });
    await d.tap({ type: 'set-clock', ms: 390_000 });
    expect(d.shown()).toMatchObject({ text: '6:30', running: false });
    // Undo then takes back the last PLAY, the basket: the clock stays as it was set.
    await d.tap({ type: 'undo' });
    expect(basketball.derive(d.game()).teams.home.score).toBe(0);
    expect(d.shown().text).toBe('6:30');
    await until(d.clock, d.controller.leave());
  });

  it('a period change is undone and the clock returns to where it was', async () => {
    const d = device('fast', 30_000);
    await until(d.clock, d.controller.start());
    await until(d.clock, d.controller.idle());
    for (const input of lineups) await d.tap(input);
    await d.tap({ type: 'start' });
    await d.clock.advance(125_000);
    await d.tap({ type: 'pause' });
    expect(d.shown().text).toBe('5:55');
    await d.tap({ type: 'period', period: 2 });
    expect(basketball.derive(d.game()).period).toBe(2);
    expect(d.shown()).toMatchObject({ text: '8:00', running: false });
    await d.tap({ type: 'undo' });
    expect(basketball.derive(d.game()).period).toBe(1);
    expect(d.shown()).toMatchObject({ text: '5:55', running: false });
    await until(d.clock, d.controller.leave());
  });

  it('taps kept with no connection and sent late give the server the same clock and minutes (T6 §4)', async () => {
    const d = device('slow', -30_000);
    await until(d.clock, d.controller.start());
    await until(d.clock, d.controller.idle());
    // The connection drops before tip-off and stays down for the whole stretch.
    d.sends.mode = 'down';
    for (const input of lineups) await d.tap(input);
    await d.tap({ type: 'start' });
    await d.clock.advance(100_000);
    await d.tap({ type: 'foul', side: 'home', playerId: homeFive[0] ?? '' });
    await d.clock.advance(20_000);
    await d.tap({ type: 'start' });
    await d.clock.advance(15_000);
    await d.tap({ type: 'timeout', side: 'away', seconds: 60 });
    expect(d.sends.saved).toEqual([]);
    const onDevice = d.game();
    expect(d.shown()).toMatchObject({ text: '6:05', running: false });

    // Five minutes later the connection is back and everything is sent.
    await d.clock.advance(5 * 60_000);
    d.sends.mode = 'up';
    d.controller.online();
    await until(d.clock, d.controller.idle());
    expect(d.sends.saved).toHaveLength(6);
    // The server plays each tap at the time it was tapped, not the time it arrived.
    const onServer = playedOnServer(d.sends);
    expect(onServer.clock).toEqual(onDevice.clock);
    expect(readClock(onServer, d.serverNow()).text).toBe('6:05');
    expect(basketball.derive(onServer).players).toEqual(basketball.derive(onDevice).players);
    expect(basketball.derive(onServer).players[homeFive[0] ?? '']?.ms).toBe(115_000);
    await until(d.clock, d.controller.leave());
  });
});
