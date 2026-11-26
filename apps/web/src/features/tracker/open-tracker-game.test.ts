// Opening a game on the device against the real endpoints over the made-up stand-in
// (endpoint-network.test-helper.ts): the session is taken, the rosters and the state are
// stored on the device (T-115), and the format is confirmed once per device (P7 §5.1).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
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
import { createMemoryOpenedGameStorage } from './memory-opened-game-storage.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { standInPeople } from '../../server/stand-in-cast.ts';
import {
  holdCheckMs,
  openTrackerGame,
  screenOf,
  type OpenTrackerGameOptions,
} from './open-tracker-game.ts';
import { madeUpRosters } from './opened-game-storage-contract.test-helper.ts';
import { formatOf, openedGameKeepMs, type OpenedGameStorage } from './opened-game-storage.ts';
import { QueueError, type QueueStorage } from './queue-storage.ts';
import type { TapInput } from './tracker-controller.ts';
import type { QueueClock } from './tracker-queue.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;

type Device = { readonly queue: QueueStorage; readonly games: OpenedGameStorage };
const newDevice = (): Device => ({
  queue: createMemoryQueueStorage(),
  games: createMemoryOpenedGameStorage(),
});

/**
 * Each person's made-up account id, the one the server's session has: the device keeps
 * their games and taps under it, and each batch says it (T-327).
 */
const accountOf = (as: Person) =>
  as === 'visitor' ? '00000000-0000-4000-8000-0000000000ff' : standInPeople[as].accountId;

let deviceNumber = 0;
async function open(
  network: EndpointNetwork,
  as: Person,
  device: Device = newDevice(),
  clock?: QueueClock,
  more: Partial<Pick<OpenTrackerGameOptions, 'deviceAccount' | 'markSignedIn' | 'rosters'>> = {},
) {
  const fetch = network.fetchAs(as);
  const opened = await openTrackerGame({
    gameId,
    leagueId: liveLeagueId,
    accountId: accountOf(as),
    rosters: madeUpRosters,
    openStorage: async () => device,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
    newDeviceId: () => `device-${(deviceNumber += 1)}`,
    now: () => 1_000,
    controller: { random: () => 1, ...(clock === undefined ? {} : { clock }) },
    ...more,
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

  it('lets go of the games the device should not keep, and keeps the one opened', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const scorekeeper = { leagueId: liveLeagueId, accountId: accountOf('scorekeeper') };
    const earlier = '00000000-0000-4000-8000-0000000001a1';
    const recent = '00000000-0000-4000-8000-0000000001a2';
    await device.games.saveRosters({ ...scorekeeper, gameId: earlier }, madeUpRosters, 0);
    await device.games.saveRosters({ ...scorekeeper, gameId: recent }, madeUpRosters, 900);
    // Another account's game (someone who used the device before, still signed in).
    await device.games.saveRosters(
      { gameId, leagueId: liveLeagueId, accountId: accountOf('owner') },
      madeUpRosters,
      900,
    );
    // `open` opens at 1_000 ms: the game stored at 0 is not older than two weeks yet.
    const game = await open(network, 'scorekeeper', device);
    expect((await device.games.find(gameId))?.accountId).toBe(accountOf('scorekeeper'));
    expect(await device.games.find(earlier)).toBeDefined();
    expect(await device.games.find(recent)).toBeDefined();
    await game.controller.leave();

    const later = await openTrackerGame({
      gameId: recent,
      ...scorekeeper,
      rosters: madeUpRosters,
      openStorage: async () => device,
      transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId: recent }),
      server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId: recent }),
      newDeviceId: () => 'device',
      // Two weeks and a moment later: both earlier games are now too old to keep.
      now: () => 1_001 + openedGameKeepMs,
    });
    if (!later.ok) throw new Error(later.code);
    expect(await device.games.find(earlier)).toBeUndefined();
    expect(await device.games.find(gameId)).toBeUndefined();
    expect(await device.games.find(recent)).toBeDefined();
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

  it('does not ask about the format of a game already under way: it carries on scoring', () => {
    const started = basketball.apply(
      basketball.newGame(basketball.HALVES),
      { type: 'team-turnover', side: 'home' },
      { id: 'play-1', now: 0 },
    );
    expect(started.plays.length).toBeGreaterThan(0);
    const scoring = { mode: { kind: 'scoring' } as const, game: started };
    expect(screenOf(scoring, null)).toEqual({
      kind: 'scoring',
      format: formatOf(basketball.HALVES),
    });
    expect(screenOf(scoring, formatOf(basketball.QUARTERS)).kind).toBe('scoring');
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

  it('a device whose game is taken over says so at its next renewal, a few seconds on (T-295)', async () => {
    const network = endpointNetwork();
    // The first device's timers, run by hand: only its renewals are waited for here.
    const timers: { readonly ms: number; readonly run: () => void }[] = [];
    const clock: QueueClock = {
      now: () => 1_000,
      after: (ms, run) => {
        const timer = { ms, run };
        timers.push(timer);
        return () => void timers.splice(timers.indexOf(timer), 1);
      },
    };
    const first = await open(network, 'scorekeeper', newDevice(), clock);
    const renewal = timers.find((timer) => timer.ms === holdCheckMs);
    expect(holdCheckMs).toBeLessThanOrEqual(5_000);
    expect(renewal).toBeDefined();
    const second = await open(network, 'owner');
    expect(await second.controller.takeOver()).toEqual({ ok: true });
    expect(first.controller.status().mode.kind).toBe('scoring');
    renewal?.run();
    await first.controller.idle();
    expect(first.controller.status().mode).toMatchObject({
      kind: 'read-only',
      reason: 'taken-over',
    });
    await first.controller.leave();
    await second.controller.leave();
  });

  it('is read-only for someone who may not score the game, and stores no state', async () => {
    const network = endpointNetwork();
    const game = await open(network, 'coach');
    expect(screen(game)).toEqual({ kind: 'read-only', reason: 'not-allowed' });
    expect((await game.device.games.find(gameId))?.state).toBeNull();
  });

  it('deletes the names kept on the device once the server says the account is signed out', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const other = '00000000-0000-4000-8000-0000000001a3';
    await device.games.saveRosters(
      { gameId: other, leagueId: liveLeagueId, accountId: accountOf('visitor') },
      madeUpRosters,
      900,
    );
    // Signed out since the page was drawn: the server turns the device away with 401.
    const game = await open(network, 'visitor', device);
    expect(screen(game)).toEqual({ kind: 'read-only', reason: 'signed-out' });
    await new Promise((settle) => setTimeout(settle, 0));
    expect(await device.games.find(gameId)).toBeUndefined();
    expect(await device.games.find(other)).toBeUndefined();
  });

  it('signed out on the device while it opens: writes nothing after the clearing (step 2.38)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const fetch = network.fetchAs('scorekeeper');
    let signedOut = false;
    const result = await openTrackerGame({
      gameId,
      leagueId: liveLeagueId,
      accountId: accountOf('scorekeeper'),
      rosters: madeUpRosters,
      // The sign-out lands while the device's storage opens, and clears what is kept.
      openStorage: async () => {
        signedOut = true;
        await device.games.forgetAll();
        return device;
      },
      transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
      server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
      newDeviceId: () => 'device-signed-out',
      now: () => 1_000,
      letGo: () => signedOut,
    });
    expect(result).toEqual({ ok: false, code: 'let-go' });
    expect(await device.games.find(gameId)).toBeUndefined();
  });

  it('keeps the rosters, names and state when the sign-in runs out mid-game (record 054)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    let who: Person = 'scorekeeper';
    // The scorekeeper's sign-in runs out once the game is open: the server answers as
    // for a visitor (401).
    const fetch = ((input: string | URL | Request, init?: RequestInit) =>
      network.fetchAs(who)(input, init)) as typeof globalThis.fetch;
    const opened = await openTrackerGame({
      gameId,
      leagueId: liveLeagueId,
      accountId: accountOf('scorekeeper'),
      rosters: madeUpRosters,
      openStorage: async () => device,
      transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
      server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
      newDeviceId: () => `device-${(deviceNumber += 1)}`,
      now: () => 1_000,
      controller: { random: () => 1 },
    });
    if (!opened.ok) throw new Error(opened.code);
    const { controller } = opened.game;
    await controller.start();
    await controller.idle();
    who = 'visitor';
    // The next tap's send is turned away: scoring goes on, signed out.
    const tapped = await controller.tap({ type: 'lineup', side: 'home', playerIds: hawks });
    expect(tapped.ok).toBe(true);
    await controller.idle();
    await new Promise((settle) => setTimeout(settle, 0));
    expect(controller.status().signedOut).toBe(true);
    expect(controller.status().mode).toEqual({ kind: 'scoring' });
    const kept = await device.games.find(gameId);
    expect(kept?.rosters).toEqual(madeUpRosters);
    expect(kept?.state).not.toBeNull();
    // The tap still waiting keeps its league, so "Your games" lists it there (T-317).
    expect((await device.queue.list(gameId)).map((entry) => entry.leagueId)).toEqual([
      liveLeagueId,
    ]);
  });

  it('reloaded with no signal, scores on from what the device kept, and settles once the server answers (step 2.38, M5)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const basket = (side: 'home' | 'away', playerId: string): TapInput => ({
      type: 'score',
      side,
      playerId,
      points: 2,
    });
    const first = await open(network, 'scorekeeper', device, createManualClock());
    const taps: TapInput[] = [
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
      basket('home', hawks[0] ?? ''),
    ];
    for (const input of taps) expect((await first.controller.tap(input)).ok).toBe(true);
    await first.controller.idle();
    // Every tap is on the server: the queue holds none, and the device keeps them in the
    // state it last loaded or on top of it, with the session it scored under.
    expect(await device.queue.list(gameId)).toEqual([]);
    const kept = await device.games.find(gameId);
    expect((kept?.state?.sequence ?? 0) + (kept?.scoring?.onTop.length ?? 0)).toBe(3);
    expect(kept?.scoring?.sessionId).toEqual(expect.any(String));
    // The page reloads in a gym with no signal: the old page never released the game.
    first.controller.hidden();
    network.mode = 'down';
    const clock = createManualClock();
    const again = await open(network, 'scorekeeper', device, clock);
    expect(again.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(
      basketball.derive(
        again.controller.status().game ?? kept?.state?.state ?? basketball.newGame(),
      ).teams.home.score,
    ).toBe(2);
    expect((await again.controller.tap(basket('away', bears[0] ?? ''))).ok).toBe(true);
    await clock.advance(60_000);
    expect(again.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(again.controller.status().queue.waiting).toBe(1);
    // The network is back and nobody took the game: the waiting tap is taken.
    network.mode = 'up';
    again.controller.online();
    await again.controller.idle();
    await clock.advance(60_000);
    await again.controller.idle();
    expect(again.controller.status().queue.waiting).toBe(0);
    expect(again.controller.status().mode).toEqual({ kind: 'scoring' });
    const score = basketball.derive(again.controller.status().game ?? basketball.newGame()).teams;
    expect([score.home.score, score.away.score]).toEqual([2, 2]);
    expect(again.controller.status().serverSequence).toBeGreaterThanOrEqual(3);
    await again.controller.leave();
  });

  it('reloaded with no signal while someone takes the game, lists the taps made since as not saved (step 2.38)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const first = await open(network, 'scorekeeper', device, createManualClock());
    for (const input of [
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
    ] satisfies TapInput[]) {
      expect((await first.controller.tap(input)).ok).toBe(true);
    }
    await first.controller.idle();
    first.controller.hidden();
    network.mode = 'down';
    const clock = createManualClock();
    const again = await open(network, 'scorekeeper', device, clock);
    expect(again.controller.status().mode).toEqual({ kind: 'scoring' });
    const basket: TapInput = { type: 'score', side: 'home', playerId: hawks[0] ?? '', points: 2 };
    expect((await again.controller.tap(basket)).ok).toBe(true);
    // Its send is tried while the signal is still down (each tap's account is read with
    // the queue, T-321, which takes the send a moment longer to start).
    await again.controller.idle();
    const keptScoring = (await device.games.find(gameId))?.scoring ?? null;
    expect(keptScoring?.onTop.map((c) => c.input.type)).toContain('score');
    // Meanwhile someone else takes the game on another device.
    network.mode = 'up';
    const other = await open(network, 'owner');
    expect(await other.controller.takeOver()).toEqual({ ok: true });
    // The signal comes back: the basket is listed as not saved, and nothing more is scored.
    again.controller.online();
    await again.controller.idle();
    await clock.advance(60_000);
    await again.controller.idle();
    expect(again.controller.status().mode.kind).not.toBe('scoring');
    expect(again.controller.status().queue.waiting).toBe(0);
    expect(again.controller.status().notSaved.map((tap) => tap.command.input.type)).toEqual([
      'score',
    ]);
    // The kept scoring went with the game (review M3): a reload with no signal does not
    // return to scoring it, and the basket stays listed not saved, once.
    expect((await device.games.find(gameId))?.scoring).toBeUndefined();
    network.mode = 'down';
    const third = await open(network, 'scorekeeper', device, createManualClock());
    expect(third.controller.status().mode.kind).not.toBe('scoring');
    expect(
      (await device.queue.list(gameId)).filter((entry) => entry.state === 'not-saved'),
    ).toHaveLength(1);
    network.mode = 'up';
    await third.controller.leave();
    // Had the forgetting not landed (it fails quietly), the kept scoring comes back with
    // no signal, but the basket listed not saved is never counted on the screen again.
    await device.games.saveScoring(gameId, keptScoring);
    network.mode = 'down';
    const fourth = await open(network, 'scorekeeper', device, createManualClock());
    expect(fourth.controller.status().mode).toEqual({ kind: 'scoring' });
    expect(
      basketball.derive(fourth.controller.status().game ?? basketball.newGame()).teams.home.score,
    ).toBe(0);
    network.mode = 'up';
    await fourth.controller.leave();
    await again.controller.leave();
    await other.controller.leave();
  });

  it('with no signal, scores from what the device kept only for the person marked signed in here (T-327, review M1)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const first = await open(network, 'scorekeeper', device, createManualClock());
    for (const input of [
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
    ] satisfies TapInput[]) {
      expect((await first.controller.tap(input)).ok).toBe(true);
    }
    await first.controller.idle();
    first.controller.hidden();
    network.mode = 'down';
    // Someone else signed in on another page of the league since: the device says so.
    const someoneElse = await open(network, 'scorekeeper', device, createManualClock(), {
      deviceAccount: async () => accountOf('owner'),
    });
    expect(someoneElse.controller.status().mode.kind).not.toBe('scoring');
    // Nobody marked (signed out since, or a device from before this release): the same.
    const nobody = await open(network, 'scorekeeper', device, createManualClock(), {
      deviceAccount: async () => null,
    });
    expect(nobody.controller.status().mode.kind).not.toBe('scoring');
    // Marked as the scorekeeper: scoring goes on from the device.
    const same = await open(network, 'scorekeeper', device, createManualClock(), {
      deviceAccount: async () => accountOf('scorekeeper'),
    });
    expect(same.controller.status().mode).toEqual({ kind: 'scoring' });
    network.mode = 'up';
    for (const game of [someoneElse, nobody, same, first]) await game.controller.leave();
  });

  it('never sends a tap kept for another person, and marks the device once the server answers (T-327)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const first = await open(network, 'scorekeeper', device, createManualClock());
    for (const input of [
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
    ] satisfies TapInput[]) {
      expect((await first.controller.tap(input)).ok).toBe(true);
    }
    await first.controller.idle();
    network.mode = 'down';
    const basket: TapInput = { type: 'score', side: 'home', playerId: hawks[0] ?? '', points: 2 };
    expect((await first.controller.tap(basket)).ok).toBe(true);
    await first.controller.idle();
    first.controller.hidden();
    // Another person signs in on the same device and opens the game with a signal.
    network.mode = 'up';
    const marked: string[] = [];
    const other = await open(network, 'owner', device, createManualClock(), {
      markSignedIn: async (accountId) => {
        marked.push(accountId);
      },
    });
    expect(marked).toEqual([accountOf('owner')]);
    expect(other.controller.status().queue.waiting).toBe(0);
    const score = basketball.derive(other.controller.status().game ?? basketball.newGame()).teams;
    expect(score.home.score).toBe(0);
    // The scorekeeper's basket stays on the device, hidden, for when they sign in again.
    expect(
      (await device.queue.list(gameId)).map((entry) => [entry.accountId, entry.state]),
    ).toEqual([[accountOf('scorekeeper'), 'waiting']]);
    await other.controller.leave();
    await first.controller.leave();
  });

  it('keeps the rosters while the End waits, and lets them go once it is saved (step 2.226, M4)', async () => {
    const network = endpointNetwork();
    const device = newDevice();
    const clock = createManualClock();
    const game = await open(network, 'scorekeeper', device, clock);
    const taps: TapInput[] = [
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
      { type: 'score', side: 'home', playerId: hawks[0] ?? '', points: 2 },
    ];
    for (const input of taps) expect((await game.controller.tap(input)).ok).toBe(true);
    await game.controller.idle();
    // Live, every tap saved: the rosters stay.
    expect((await device.games.find(gameId))?.rosters).toEqual(madeUpRosters);
    network.mode = 'down';
    expect((await game.controller.tap({ type: 'end' })).ok).toBe(true);
    await game.controller.idle();
    await clock.advance(60_000);
    // Ended on the device, the End still waiting: the rosters stay.
    expect(game.controller.status().game?.status).toBe('final');
    expect(game.controller.status().waiting).toHaveLength(1);
    expect((await device.games.find(gameId))?.rosters).toEqual(madeUpRosters);
    network.mode = 'up';
    game.controller.online();
    await game.controller.idle();
    await clock.advance(60_000);
    await game.controller.idle();
    await new Promise((settle) => setTimeout(settle, 0));
    // Ended and saved: the game's rosters, names and state are gone from the device.
    expect(game.controller.status().waiting).toEqual([]);
    expect(await device.games.find(gameId)).toBeUndefined();
    await game.controller.leave();
  });

  it('does not use again rosters stored before step 2.226 unless taps wait (T-484)', async () => {
    // madeUpRosters has no mark: a copy a page stored before the step, names as recorded.
    const marked = { ...madeUpRosters, scoringNames: true as const };
    const reloaded = async (tapWaits: boolean) => {
      const network = endpointNetwork();
      const device = newDevice();
      const first = await open(network, 'scorekeeper', device, createManualClock());
      const lineup: TapInput = { type: 'lineup', side: 'home', playerIds: hawks };
      expect((await first.controller.tap(lineup)).ok).toBe(true);
      await first.controller.idle();
      network.mode = 'down';
      if (tapWaits) {
        const away: TapInput = { type: 'lineup', side: 'away', playerIds: bears };
        expect((await first.controller.tap(away)).ok).toBe(true);
        await first.controller.idle();
      }
      first.controller.hidden();
      // The release's page, with no signal: it scores on from what the device kept.
      const again = await open(network, 'scorekeeper', device, createManualClock(), {
        rosters: marked,
      });
      expect(again.controller.status().mode).toEqual({ kind: 'scoring' });
      await again.controller.idle();
      await new Promise((settle) => setTimeout(settle, 0));
      return (await device.games.find(gameId))?.rosters;
    };
    expect(await reloaded(false)).toEqual(marked);
    expect(await reloaded(true)).toEqual(madeUpRosters);
  });

  it('keeps the names on the device when refused for another reason', async () => {
    const network = endpointNetwork();
    const game = await open(network, 'coach');
    expect(screen(game)).toEqual({ kind: 'read-only', reason: 'not-allowed' });
    await new Promise((settle) => setTimeout(settle, 0));
    expect((await game.device.games.find(gameId))?.rosters).toEqual(madeUpRosters);
  });

  it('gives the controller the doors it is opened with: Reopen and Mark not started (step 2.37)', async () => {
    const network = endpointNetwork();
    const fetch = network.fetchAs('scorekeeper');
    const at = { leagueId: liveLeagueId, gameId, fetch };
    const options = {
      gameId,
      leagueId: liveLeagueId,
      accountId: accountOf('scorekeeper'),
      rosters: madeUpRosters,
      transport: createFetchCommandTransport(at),
      server: createFetchTrackerServer(at),
      now: () => 1_000,
      controller: { random: () => 1 },
    };
    // Opened with no doors (a test without them): neither is offered, and nothing is asked.
    const without = await openTrackerGame({
      ...options,
      openStorage: async () => newDevice(),
      newDeviceId: () => 'device-without-doors',
    });
    if (!without.ok) throw new Error(without.code);
    await without.game.controller.start();
    await without.game.controller.idle();
    expect(await without.game.controller.reopenOffer()).toBeNull();
    expect(await without.game.controller.markNotStarted()).toEqual({
      ok: false,
      reason: 'not-offered',
    });
    expect(network.reached.filter((r) => /reopen|not-started/.test(r))).toEqual([]);
    await without.game.controller.leave();

    // Opened as the page opens it: the league is asked, and its own answer comes back.
    const opened = await openTrackerGame({
      ...options,
      openStorage: async () => newDevice(),
      newDeviceId: () => 'device-with-doors',
      doors: createFetchGameDoors(at),
    });
    if (!opened.ok) throw new Error(opened.code);
    await opened.game.controller.start();
    await opened.game.controller.idle();
    const offer = await opened.game.controller.reopenOffer();
    expect(network.reached).toContain('GET reopen');
    // The game is not over, so Reopen is not offered: the league's word, not "no doors".
    expect(offer?.reopen.when).toBe('no');
    await opened.game.controller.leave();
  });

  it('opens nothing on a device with no storage', async () => {
    const network = endpointNetwork();
    const fetch = network.fetchAs('scorekeeper');
    const opened = await openTrackerGame({
      gameId,
      leagueId: liveLeagueId,
      accountId: accountOf('scorekeeper'),
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
