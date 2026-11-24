// Opening a game on the scorekeeper's device (P7 §5.1, T6 §4 and §5; T-115, T-116): the
// steps the tracker's page takes before anything is scored, with no drawing.
//
// 1. The device's storage is opened: the queue (T-114) and the opened games (T-115). A
//    device with no database storage cannot keep taps, so the game is not opened.
// 2. The games the device lets go of are deleted (another account's or league's, final,
//    or older than `openedGameKeepMs`: `stillKept`), the rosters the page brought are
//    stored under the signed-in account, and the device's own id is read, or made the
//    first time.
// 3. The controller takes the scoring session and loads the engine's state through the
//    one state read (record 049), which is stored on the device as it comes in
//    (storing-tracker-server.ts).
// 4. The scorekeeper confirms the game format before scoring (P7 §5.1): `screenOf`
//    says when, and `confirmFormat` stores it on the device, so the same format is not
//    asked again on this device. A format changed since is asked again. A game that
//    already has plays is not asked about: whoever takes it over continues (P7 §5.2).
// 5. Once the server says the account is signed out (401), the names the device keeps
//    are deleted (`forgetAll`), as signing out on the device deletes them: whoever
//    picks the device up next does not find the players' names on it (T-115).
import type { QueueErrorCode } from './queue-storage.ts';
import { inLeague, QueueError, type QueueStorage } from './queue-storage.ts';
import type { CommandTransport } from './command-transport.ts';
import type { GameDoors } from './game-doors.ts';
import {
  formatOf,
  noLineupPicks,
  openedGameKeepMs,
  sameFormat,
  type DeviceRosters,
  type DeviceScoring,
  type GameFormat,
  type LineupPicks,
  type OpenedGameStorage,
} from './opened-game-storage.ts';
import { createStoringTrackerServer } from './storing-tracker-server.ts';
import {
  createTrackerController,
  type ReadOnlyReason,
  type TrackerController,
  type TrackerControllerOptions,
  type TrackerControllerStatus,
} from './tracker-controller.ts';
import type { ServerState, TrackerServer } from './tracker-server.ts';

/** What the tracker's page shows while a game is opened, chosen from the controller's status. */
export type OpeningScreen =
  /** Taking the session and loading the game (it keeps trying while offline). */
  | { readonly kind: 'opening' }
  /** Another device holds the game: offer to take over (T6 §5). */
  | { readonly kind: 'held-by-other'; readonly name: string }
  | { readonly kind: 'read-only'; readonly reason: ReadOnlyReason }
  /** This device holds the game; the scorekeeper confirms its format first. */
  | { readonly kind: 'confirm-format'; readonly format: GameFormat }
  /** This device holds the game and its format is confirmed: the scoring screen. */
  | { readonly kind: 'scoring'; readonly format: GameFormat };

export function screenOf(
  status: Pick<TrackerControllerStatus, 'mode' | 'game'>,
  confirmed: GameFormat | null,
): OpeningScreen {
  const { mode, game } = status;
  switch (mode.kind) {
    case 'held-by-other':
      return { kind: 'held-by-other', name: mode.holder.displayName };
    case 'read-only':
      return { kind: 'read-only', reason: mode.reason };
    case 'opening':
      return { kind: 'opening' };
    case 'scoring': {
      if (game === null) return { kind: 'opening' };
      const format = formatOf(game.rules);
      // A game already under way is played under the format it started with: a device
      // taking it over mid-game carries on scoring, it is not asked to check it (P7 §5.2).
      return game.plays.length > 0 || sameFormat(confirmed, format)
        ? { kind: 'scoring', format }
        : { kind: 'confirm-format', format };
    }
  }
}

export type OpenTrackerGameOptions = {
  readonly gameId: string;
  readonly leagueId: string;
  /** The signed-in account opening the game, from the server's session. */
  readonly accountId: string;
  readonly rosters: DeviceRosters;
  /** Opens the device's storage: in the browser, IndexedDB. */
  readonly openStorage: () => Promise<{
    readonly queue: QueueStorage;
    readonly games: OpenedGameStorage;
  }>;
  readonly transport: CommandTransport;
  readonly server: TrackerServer;
  /**
   * Reopening the game and marking it not started (game-doors.ts; step 2.37): in the
   * browser, fetch-game-doors.ts. Left out, the controller offers neither.
   */
  readonly doors?: GameDoors;
  /**
   * True once the page let go of the game before it was open (signed out on the device,
   * or left): the opening then keeps nothing more on the device and makes no controller,
   * so the clearing of a sign-out is the last thing written (step 2.38). Left out: never.
   */
  readonly letGo?: () => boolean;
  /**
   * Who the device says is signed in here (device-account.ts, T-327). What the device kept
   * of the game (its state and scoring) is scored from with no signal only when this is
   * the account opening it: someone else may have signed in on another page since. Left
   * out: the account opening (tests).
   */
  readonly deviceAccount?: () => Promise<string | null>;
  /**
   * Called once the server has answered with the game's state: the page reached the
   * network signed in as `accountId`, so the device's mark is written (T-327).
   */
  readonly markSignedIn?: (accountId: string) => Promise<void>;
  /** A new device id, used only the first time this device opens a game. */
  readonly newDeviceId: () => string;
  readonly now?: () => number;
  /** The device could not store the state it loaded (the game can still be scored). */
  readonly onStoreFailed?: (code: QueueErrorCode) => void;
  /** Passed on to the controller (tests). */
  readonly controller?: Pick<
    TrackerControllerOptions,
    'clock' | 'newCommandId' | 'random' | 'retry' | 'queue' | 'renewEveryMs'
  >;
};

/**
 * How often the scoring screen asks whether it still holds the game (step 2.37, part 2;
 * T-295): every few seconds, not every half minute, so a device that has lost the game
 * to another says so within a few seconds even when no tap is being sent. The renewal
 * is the one request that finds this out. The server writes the lease only when less
 * than half of it is left, and a hidden page does not ask (the controller's `hidden`).
 */
export const holdCheckMs = 5_000;

export type OpenedTrackerGame = {
  readonly controller: TrackerController;
  readonly deviceId: string;
  /** The format confirmed on this device, null until it has been. */
  confirmedFormat(): GameFormat | null;
  /** Stores the format the scorekeeper confirmed (P7 §5.1). */
  confirmFormat(format: GameFormat): Promise<void>;
  /** The starters being picked, as the device kept them (checklist C3). */
  lineupPicks(): LineupPicks;
  /** Keeps the starters being picked, so a reload mid-pick keeps the taps. */
  keepLineupPicks(picks: LineupPicks): Promise<void>;
};

export type OpenTrackerGameResult =
  | { readonly ok: true; readonly game: OpenedTrackerGame }
  /** The device's storage is not there or failed: nothing can be kept, so nothing is opened. */
  | { readonly ok: false; readonly code: QueueErrorCode }
  /** Let go of before it was open (`letGo`): nothing was kept for it, nothing is opened. */
  | { readonly ok: false; readonly code: 'let-go' };

const codeOf = (error: unknown): QueueErrorCode =>
  error instanceof QueueError ? error.code : 'storage-unavailable';

/** `server`, calling `mark` once, the first time the game's state is answered (T-327). */
function markingOnAnswer(
  server: TrackerServer,
  mark: () => Promise<void> | undefined,
): TrackerServer {
  let marked = false;
  return {
    session: (request, signal) => server.session(request, signal),
    async loadState(signal) {
      const outcome = await server.loadState(signal);
      if (outcome.kind === 'answer' && !marked) {
        marked = true;
        await mark()?.catch(() => undefined);
      }
      return outcome;
    },
  };
}

/**
 * Prepares the device and makes the controller; `controller.start()` then takes the
 * session and loads the game. The caller starts it once it listens to its status.
 */
export async function openTrackerGame(
  options: OpenTrackerGameOptions,
): Promise<OpenTrackerGameResult> {
  const { gameId, leagueId, accountId, rosters, now = Date.now, letGo = () => false } = options;
  const owner = { gameId, leagueId, accountId };
  const letGoOf = { ok: false, code: 'let-go' } as const;
  let storage: Awaited<ReturnType<OpenTrackerGameOptions['openStorage']>>;
  let deviceId: string;
  let confirmed: GameFormat | null;
  let picks: LineupPicks;
  let keptGame: { readonly state: ServerState | null; readonly scoring: DeviceScoring | null };
  let earlierRosters: DeviceRosters | null = null;
  try {
    // Checked after each wait, just before the next write: a sign-out made meanwhile
    // has its clearing come after, so no rosters come back once it has cleared.
    if (letGo()) return letGoOf;
    storage = await options.openStorage();
    const openedAt = now();
    if (letGo()) return letGoOf;
    await storage.games.forgetOthers(owner, openedAt - openedGameKeepMs);
    if (letGo()) return letGoOf;
    // The rosters kept before this opening (a fetch may have had more than the page's
    // copy, which a worker kept earlier): started from when opening gets no answer.
    earlierRosters = (await storage.games.find(gameId))?.rosters ?? null;
    await storage.games.saveRosters(owner, rosters, openedAt);
    deviceId = await storage.games.deviceId(options.newDeviceId);
    const kept = await storage.games.find(gameId);
    confirmed = kept?.confirmedFormat ?? null;
    // Kept for this very account, and the device says it is the one signed in here (T-327).
    const here = await (options.deviceAccount ?? (async () => accountId))();
    const ours =
      kept?.accountId === accountId &&
      here !== null &&
      here.toLowerCase() === accountId.toLowerCase();
    keptGame = ours
      ? { state: kept.state, scoring: kept.scoring ?? null }
      : { state: null, scoring: null };
    if (!ours) earlierRosters = null;
    picks = kept?.lineupPicks ?? noLineupPicks;
  } catch (error) {
    return { ok: false, code: codeOf(error) };
  }
  if (letGo()) return letGoOf;
  const { games } = storage;
  const controller = createTrackerController({
    renewEveryMs: holdCheckMs,
    ...options.controller,
    gameId,
    deviceId,
    // Each tap keeps its league, so "Your games" lists it there however old (T-317), and
    // its account: another account's taps on this device are never sent from here (T-321).
    storage: inLeague(storage.queue, leagueId, accountId),
    // With no answer on opening, scoring starts from what the device kept (step 2.38).
    kept: keptGame,
    keepScoring: (scoring) => games.saveScoring(gameId, scoring),
    // The device lost the game: what it kept of its scoring goes, so a reload with no
    // signal does not score on under the lost session (step 2.38, review M3).
    forgetScoring: () => games.saveScoring(gameId, null),
    // The Players panel's rosters (step 2.118): each fetched one is kept on the device.
    rosters: {
      page: rosters,
      kept: earlierRosters,
      keep: (fetched) => games.saveRosters(owner, fetched, now()),
    },
    transport: options.transport,
    ...(options.doors === undefined ? {} : { doors: options.doors }),
    server: createStoringTrackerServer({
      gameId,
      server: markingOnAnswer(options.server, () => options.markSignedIn?.(accountId)),
      storage: games,
      ...(options.onStoreFailed === undefined ? {} : { onStoreFailed: options.onStoreFailed }),
    }),
  });
  // Turned away as signed out before the game was open (read-only, `signed-out`): the
  // names kept on the device go. Signed out once scoring, the game stays open on the
  // device (`signedOut`, record 054): its rosters, names and state stay with it.
  let forgotten = false;
  controller.subscribe(({ mode }) => {
    if (forgotten || mode.kind !== 'read-only' || mode.reason !== 'signed-out') return;
    forgotten = true;
    games.forgetAll().catch((error: unknown) => options.onStoreFailed?.(codeOf(error)));
  });
  return {
    ok: true,
    game: {
      controller,
      deviceId,
      confirmedFormat: () => confirmed,
      async confirmFormat(format) {
        // Confirmed for this visit even if the device cannot keep it: it is asked again
        // next time, which is the safe side.
        confirmed = format;
        try {
          await games.confirmFormat(gameId, format);
        } catch (error) {
          options.onStoreFailed?.(codeOf(error));
        }
      },
      lineupPicks: () => picks,
      async keepLineupPicks(next) {
        // Kept for this visit even if the device cannot store them: the lineup itself is
        // a play, saved like any other once it is set. Picks are a convenience.
        picks = next;
        await games.saveLineupPicks(gameId, next).catch(() => undefined);
      },
    },
  };
}
