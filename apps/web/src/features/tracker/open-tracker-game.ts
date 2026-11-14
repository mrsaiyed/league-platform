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
import { QueueError, type QueueStorage } from './queue-storage.ts';
import type { CommandTransport } from './command-transport.ts';
import {
  formatOf,
  openedGameKeepMs,
  sameFormat,
  type DeviceRosters,
  type GameFormat,
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
import type { TrackerServer } from './tracker-server.ts';

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
  /** A new device id, used only the first time this device opens a game. */
  readonly newDeviceId: () => string;
  readonly now?: () => number;
  /** The device could not store the state it loaded (the game can still be scored). */
  readonly onStoreFailed?: (code: QueueErrorCode) => void;
  /** Passed on to the controller (tests). */
  readonly controller?: Pick<
    TrackerControllerOptions,
    'clock' | 'newCommandId' | 'random' | 'retry' | 'queue'
  >;
};

export type OpenedTrackerGame = {
  readonly controller: TrackerController;
  readonly deviceId: string;
  /** The format confirmed on this device, null until it has been. */
  confirmedFormat(): GameFormat | null;
  /** Stores the format the scorekeeper confirmed (P7 §5.1). */
  confirmFormat(format: GameFormat): Promise<void>;
};

export type OpenTrackerGameResult =
  | { readonly ok: true; readonly game: OpenedTrackerGame }
  /** The device's storage is not there or failed: nothing can be kept, so nothing is opened. */
  | { readonly ok: false; readonly code: QueueErrorCode };

const codeOf = (error: unknown): QueueErrorCode =>
  error instanceof QueueError ? error.code : 'storage-unavailable';

/**
 * Prepares the device and makes the controller; `controller.start()` then takes the
 * session and loads the game. The caller starts it once it listens to its status.
 */
export async function openTrackerGame(
  options: OpenTrackerGameOptions,
): Promise<OpenTrackerGameResult> {
  const { gameId, leagueId, accountId, rosters, now = Date.now } = options;
  const owner = { gameId, leagueId, accountId };
  let storage: Awaited<ReturnType<OpenTrackerGameOptions['openStorage']>>;
  let deviceId: string;
  let confirmed: GameFormat | null;
  try {
    storage = await options.openStorage();
    const openedAt = now();
    await storage.games.forgetOthers(owner, openedAt - openedGameKeepMs);
    await storage.games.saveRosters(owner, rosters, openedAt);
    deviceId = await storage.games.deviceId(options.newDeviceId);
    confirmed = (await storage.games.find(gameId))?.confirmedFormat ?? null;
  } catch (error) {
    return { ok: false, code: codeOf(error) };
  }
  const { games } = storage;
  const controller = createTrackerController({
    ...options.controller,
    gameId,
    deviceId,
    storage: storage.queue,
    transport: options.transport,
    server: createStoringTrackerServer({
      gameId,
      server: options.server,
      storage: games,
      ...(options.onStoreFailed === undefined ? {} : { onStoreFailed: options.onStoreFailed }),
    }),
  });
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
    },
  };
}
