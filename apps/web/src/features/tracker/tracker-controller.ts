// The tracker's logic on the device, with no drawing (T6 §1, §3, §4, §5; T-113, T-114,
// T-116; record 049). The screens of steps 2.35 to 2.37 read `status()` and call the
// methods below; this holds no words and no markup.
//
// - Opening takes the scoring session (T-116) and loads the engine's state from the
//   server (T-253). The game shown is that state with this device's own taps on top
//   that the server does not have yet, so a tab closed mid-game opens where it was.
// - A tap is applied to the local engine at once, stored in the queue (T-114), and only
//   then shown; the queue sends it (step 2.12). The engine's own "no" is answered on
//   the device and nothing is stored.
// - A tap the server refused (T-113) makes the controller reload the server's state
//   and rebuild the game on it, without the refused taps, which are listed as not
//   applied until the scorekeeper has seen them (`dismissNotApplied`).
// - Until a game starts, the server plays it under its rules as they stand at each
//   batch (S-1), which the admin may change after this device loaded it. So while the
//   state the device works from has not started, each batch the server takes makes it
//   load the state once more and rebuild on it (record 062): from the batch that
//   starts the game, the device has the rules the server fixed.
// - When another device takes over (the renewal says so, or the server refuses taps
//   because this session no longer holds the game), or the game is decided or gone
//   while this device holds it, the device turns read-only, says why, and lists the
//   taps it had not sent as not saved (T6 §5). A tap listed as not saved is never sent:
//   it is kept in the queue's storage as not saved until the scorekeeper dismisses it,
//   so a reload keeps the list, and each loss adds to the list rather than replacing
//   it. Each tap is stored with the session it was made under, and one made under
//   another session is set aside the same way whenever this device is given a session
//   (taking the game back, or opening after a reload).
// - Offline nothing changes for the scorekeeper: taps are applied and stored, and the
//   queue sends them when the network is back (`online`).
// - Signed out mid-game nothing changes either (finding M4): taps are still applied and
//   kept, `signedOut` says so, and they are sent under the same session once the
//   scorekeeper is signed in again (the next renewal, `online` or `openAgain` finds it).
// - `now()` is the server's time (T-121, finding M1), measured over each session
//   request from the midpoint of its round trip, against the steady clock (finding M3:
//   changing the device's clock moves nothing). The closest measurement is kept, and it
//   counts as less sure as it ages, so a fresh one still replaces it in time; one that
//   disagrees with it beyond both their errors replaces it at once (finding L4). `now()`
//   never goes backwards, so the painted clock never ticks back. A sleep that stopped
//   the steady clock (iPads, Macs) is told from the wall clock running ahead of it and
//   carried over at once; `awake()` then measures again. Taps are timed by it, and the
//   screens paint the clock from it.
// - Undo, Redo and End game are taps like any other (step 2.37): applied at once, kept,
//   sent in order. An End the server does not have yet can be taken back on the device
//   alone (`takeBackEnd`). Reopening and marking not started are not taps: each is asked
//   of the server once nothing is waiting to send (`reopen`, `markNotStarted`), and on
//   success the device takes the session again and carries on in place.
import {
  isTablePlayerCommand,
  maxCommandsPerBatch,
  sessionRenewSeconds,
  knownRefusals,
  trackerProtocolVersion,
  type BatchCommand,
  type CommandBatch,
  type CommandReply,
  type NotStartedReason,
  type NotStartedRefusal,
  type ReopenOffer,
  type ReopenRefusalCode,
  type SessionReply,
  type SessionRequest,
  TablePlayerCommand,
  type TrackerCommand,
  type TrackerRefusal,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { againCommandId } from './again-command-id.ts';
import type { CommandTransport } from './command-transport.ts';
import { commandsSince } from './commands-since.ts';
import { refreshedRosters } from './device-rosters.ts';
import type { GameDoors } from './game-doors.ts';
import { mayEnterAgain } from './kept-plays.ts';
import { sameData } from '../game-format/index.ts';
import {
  formatOf,
  type DeviceRosters,
  type DeviceScoring,
  type GameFormat,
} from './opened-game-storage.ts';
import {
  changeIsIn,
  deviceProblem,
  playerChangesIn,
  withChanges,
  type DeviceProblem,
  type PlayerChange,
} from './roster-changes.ts';
import {
  QueueError,
  keptTap,
  type GameMoment,
  type KeptTap,
  type QueueErrorCode,
  type QueueStorage,
  type QueuedCommand,
} from './queue-storage.ts';
import { defaultRetryTiming, retryDelayMs, type RetryTiming } from './retry-delay.ts';
import type { ServerOutcome, ServerState, TrackerServer } from './tracker-server.ts';
import {
  browserClock,
  createTrackerQueue,
  type QueueClock,
  type QueueHalt,
  type QueueStatus,
  type RefusedCommand,
  type TrackerQueue,
  type TrackerQueueOptions,
  type Withdrawn,
} from './tracker-queue.ts';

/** A tap as the screens make it. The rules, reopening and resetting are not taps (record 038). */
export type TapInput = Exclude<TrackerCommand['input'], { type: 'rules' | 'reopen' | 'reset' }>;

/** Why the device is read-only, as fixed codes: the screen picks the words (T-187). */
export type ReadOnlyReason =
  /** Another device took the game over (T6 §5). */
  | 'taken-over'
  /** The lease ran out and someone else has had the game since (record 036). */
  | 'expired'
  /** The session was released. */
  | 'released'
  /** The server refused taps because this device no longer holds the game. */
  | 'not-held'
  /** The game is decided, cancelled or postponed. */
  | 'game-not-live'
  | 'not-allowed'
  /** No such game (404). */
  | 'unknown-game'
  /** The server turned the request away for another reason (400, say): open it again. */
  | 'request-refused'
  /** The device's storage could not be read or written: open it again to try once more. */
  | 'storage-failed'
  /**
   * Signed out before the game was open: sign in and `openAgain`. Signed out once
   * scoring, the device keeps scoring instead (`signedOut`).
   */
  | 'signed-out'
  /**
   * Signed out while scoring, then signed in again, and the session is no longer this
   * device's (finding L5): someone else signed in on it (the game was being scored under
   * another account), or another device took the game over meanwhile. The server
   * answers both the same way, so the words cover both. The taps not sent are listed as
   * not saved: they are never sent under another person's name.
   */
  | 'signed-in-as-other'
  /** The server no longer speaks this tracker's version (T-127): reload the page. */
  | 'update-needed';

export type ControllerMode =
  /** Taking the session and loading the game; while offline it keeps trying. */
  | { readonly kind: 'opening' }
  /**
   * The takeover question (S-42): another device holds the game, its lease run out or
   * not if the game is under way; `takeOver` after the scorekeeper says "Yes, take
   * over". `lastHeardAt` (server time) is when that device was last heard from;
   * `sameAccount` is the server's mark that it is this account on another device.
   */
  | {
      readonly kind: 'held-by-other';
      readonly holder: {
        readonly displayName: string;
        readonly since: number;
        readonly lastHeardAt?: number | undefined;
        readonly sameAccount?: true | undefined;
      };
      /**
       * This device has just reopened the game, and another holds it: the screen says
       * the game is open again before who is scoring it (the review by use, M3).
       */
      readonly reopened?: true;
    }
  | { readonly kind: 'scoring' }
  | { readonly kind: 'read-only'; readonly reason: ReadOnlyReason };

export type TrackerControllerStatus = {
  readonly mode: ControllerMode;
  /** The game as this device shows it; null until it has loaded. */
  readonly game: basketball.GameState | null;
  /** The sequence number of the server's state the game was last rebuilt on. */
  readonly serverSequence: number | null;
  /** The plays a correction wrote, as the server's state named them (T-408): Undo asks first. */
  readonly corrections: readonly string[];
  /** Taps the server refused, oldest first, until `dismissNotApplied` (T-113). */
  readonly notApplied: readonly RefusedCommand[];
  /**
   * Taps this device made that will not be sent: it no longer held the game (T6 §5).
   * Kept until `dismissNotSaved`, through a reload and further losses. Each carries the
   * period and game clock it was made at (finding I), so the screen can name it even
   * once the game shown has been rebuilt without it.
   */
  readonly notSaved: readonly KeptTap[];
  /** Whether "Send these plays" is offered for `notSaved` (S-43, T-335): `sendNotSaved`. */
  readonly sendNotSaved: SendNotSavedOffer;
  /**
   * The taps in `notSaved` were listed because the device could not tell whether
   * somebody else scored meanwhile (T-357): more commands came in than the server's lists
   * name. The safe side: listed, never sent unasked. False once the list is empty.
   */
  readonly cannotTell: boolean;
  /**
   * The taps not on the server yet, oldest first (finding L1), each with the period and
   * game clock it was made at (finding I): the plays whose `id` is one of these command
   * IDs are the ones still to be saved.
   */
  readonly waiting: readonly KeptTap[];
  /** Server time (ms) when the server last said it has taps of this device; null until then (L1). */
  readonly lastSavedAt: number | null;
  /**
   * Signed out while scoring (finding M4): taps are still taken and kept, and sent once
   * signed in again. The screen offers a sign-in that comes back to this game.
   */
  readonly signedOut: boolean;
  /** True while the server's state is being reloaded after a refusal. */
  readonly reloading: boolean;
  /**
   * Plays have waited with no answer for `offlineLongMs` (T6 §4, step 2.37 part 2): the
   * screen says plainly that they are only on this device. False once an answer comes.
   */
  readonly offlineLong: boolean;
  readonly queue: QueueStatus;
  /**
   * The server's time now, in milliseconds (T-121, finding M1). The clock is painted
   * from this, never from the device's own clock.
   */
  readonly now: () => number;
  /**
   * How far `now()` may be from the server's time when it was last measured: half the
   * round trip it was measured over. Null until a session reply has been timed, when
   * `now()` is the device's time.
   */
  readonly clockErrorMs: number | null;
  /**
   * The game's two rosters as the Players panel lists them (step 2.118): the rosters the
   * device keeps (the page's, or the last fetched) with every change of players this
   * device has waiting on top, so a reload with no signal lists what was typed. Null when
   * the controller was given no rosters.
   */
  readonly rosters: DeviceRosters | null;
  /**
   * The format this device plays now, when an answer of the server brought rules other
   * than those it was playing (T-344): the format was changed elsewhere, or taps waited
   * offline on the old one. Said until `dismissFormatChanged`; null otherwise.
   */
  readonly formatChangedTo: GameFormat | null;
};

/** A change of players asked for (step 2.118): it has every promise a tap has. */
export type PlayersResult =
  | {
      readonly ok: true;
      readonly commandIds: readonly string[];
      /** The player each change names, in order: a new player's id for an add. */
      readonly playerIds: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not-scoring' }
  /** `changes[index]` does not fit the contract (a number that is not one): nothing stored. */
  | { readonly ok: false; readonly reason: 'invalid'; readonly index: number }
  /** The device's own no, as the server would say it (S-37, S-45): nothing stored. */
  | {
      readonly ok: false;
      readonly reason: 'rule';
      readonly index: number;
      readonly problem: DeviceProblem;
    }
  /** The storage failed after `stored` of the changes were kept (they stay, in order). */
  | {
      readonly ok: false;
      readonly reason: 'storage';
      readonly code: QueueErrorCode;
      readonly stored: number;
    };

export type TapResult =
  | { readonly ok: true; readonly commandId: string }
  /** The device is not scoring: opening, read-only, or another device holds the game. */
  | { readonly ok: false; readonly reason: 'not-scoring' }
  /** The engine said no (`message` is the engine's, for the log, not the screen). */
  | { readonly ok: false; readonly reason: 'engine'; readonly message: string }
  /** The tap could not be stored, so it is not shown (T-114). */
  | { readonly ok: false; readonly reason: 'storage'; readonly code: QueueErrorCode };

export type EnterAgainResult =
  | TapResult
  /** No such play on either list, or one that is not entered again (the clock, Undo…). */
  | { readonly ok: false; readonly reason: 'not-kept' }
  /**
   * Entered again, but it could not be taken off its list (the storage failed): it
   * is still listed, and entering it again once more does not record it twice.
   */
  | { readonly ok: false; readonly reason: 'not-taken-off' };

/**
 * "Send these plays" for the plays listed as not saved (S-43, T-335). Never done by the
 * device itself: only `sendNotSaved`, the scorekeeper's own tap, sends them.
 */
export type SendNotSavedOffer =
  /** Nothing listed, or the device does not know the state they were made on (a reload). */
  | 'none'
  | 'offered'
  | 'sending'
  /**
   * The server refused them: something was recorded since. Each is entered again
   * (`enterAgain`, S-77) by whoever holds the game.
   */
  | 'game-moved';

export type SendNotSavedResult =
  /** Sent: `saved` are on the server now; any the engine refused stay listed. */
  | { readonly ok: true; readonly saved: number }
  | { readonly ok: false; readonly reason: 'not-offered' }
  /** Something was recorded since they were made: enter each again. */
  | { readonly ok: false; readonly reason: 'game-moved' }
  /** No answer, or the server turned the request away: still offered. */
  | { readonly ok: false; readonly reason: 'unanswered' | 'refused' };

export type TakeOverResult =
  | { readonly ok: true }
  /** Not asked: the device is not being shown another holder. */
  | { readonly ok: false; readonly reason: 'not-offered' }
  /** No answer: try again when the network is back. */
  | { readonly ok: false; readonly reason: 'unanswered' };

/** Taking back an End game tap the server does not have yet (step 2.37). */
export type TakeBackEndResult =
  | { readonly ok: true }
  /** The game shown was not ended on this device, or its End is no longer waiting. */
  | { readonly ok: false; readonly reason: 'not-waiting' }
  /** The server took the End while it was being taken back: the game is final; Reopen is the way. */
  | { readonly ok: false; readonly reason: 'already-saved' }
  /**
   * The End was sent and no answer came back: the server may have it, so it is not taken
   * back. It stays waiting; the next answer says it was saved (lane 2.37, fix round, F2).
   */
  | { readonly ok: false; readonly reason: 'maybe-saved' }
  | { readonly ok: false; readonly reason: 'storage' };

/** Why a door (Reopen, Mark not started) did not open, when the server did not say. */
export type DoorProblem =
  /** This device has no doors (a test without them), or no game is loaded. */
  | 'not-offered'
  /** Plays are still waiting to send: the door is asked only once the server has them all. */
  | 'plays-waiting'
  /** No answer: no connection. Tapping again asks again. */
  | 'unanswered'
  | 'signed-out'
  /** The server turned the request away whole (not allowed, no such game, not a request). */
  | 'rejected';

export type ReopenResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DoorProblem }
  /** The server's own refusal, and who ended the game when that is why. */
  | {
      readonly ok: false;
      readonly reason: 'refused';
      readonly code: ReopenRefusalCode;
      readonly endedBy: string | null;
    };

export type MarkNotStartedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DoorProblem }
  | { readonly ok: false; readonly reason: 'refused'; readonly code: NotStartedRefusal };

export type TrackerControllerOptions = {
  readonly gameId: string;
  /** This device's own id, made once and kept on it (T-116). */
  readonly deviceId: string;
  readonly storage: QueueStorage;
  readonly transport: CommandTransport;
  readonly server: TrackerServer;
  /**
   * Reopening and marking not started (game-doors.ts). Left out, neither is offered:
   * the calls answer `not-offered`.
   */
  readonly doors?: GameDoors;
  /** The steady clock the server's time is measured against (finding M3), and the timers. */
  readonly clock?: QueueClock;
  /**
   * The device's wall clock (Date.now()), read only to tell that the device slept while
   * its steady clock stood still; never to time anything.
   */
  readonly wallClock?: () => number;
  /** A new command ID, a UUID in lower case. */
  readonly newCommandId?: () => string;
  readonly random?: () => number;
  /** How long to wait before asking again when the session or the state got no answer. */
  readonly retry?: RetryTiming;
  /** A session or state request with no answer after this long counts as unanswered. */
  readonly requestTimeoutMs?: number;
  /** How often the session is renewed while this device holds it. */
  readonly renewEveryMs?: number;
  /** Passed on to the queue. */
  readonly queue?: Pick<TrackerQueueOptions, 'batchSize' | 'retry' | 'sendTimeoutMs' | 'reachable'>;
  /**
   * What the device kept of the game (step 2.38, finding M5; T-248, T-253): the server's
   * state as last loaded and how this device was scoring it. When the session gets no
   * answer on opening, scoring starts from them at once, under the kept session, and
   * settles with the server once it answers. Left out, opening waits for the server.
   */
  readonly kept?: { readonly state: ServerState | null; readonly scoring: DeviceScoring | null };
  /** Keeps how the device is scoring the game, each time it changes (step 2.38). */
  readonly keepScoring?: (scoring: DeviceScoring) => Promise<void>;
  /**
   * Forgets the kept scoring: the device lost the game, so a reload with no signal does
   * not score on under the lost session (step 2.38, review M3).
   */
  readonly forgetScoring?: () => Promise<void>;
  /**
   * The game's rosters (step 2.118): those the page brought, those the device kept for
   * this account (started from when opening gets no answer, so a reload with no signal
   * keeps what an earlier fetch had), and where each fetched one is kept.
   */
  readonly rosters?: {
    readonly page: DeviceRosters;
    readonly kept?: DeviceRosters | null;
    readonly keep?: (rosters: DeviceRosters) => Promise<void>;
  };
  /** A new player's id: a random (version 4) UUID, as the contract wants. */
  readonly newPlayerId?: () => string;
};

export type TrackerController = {
  /** Opens the game: the queue, the session, the server's state. */
  start(): Promise<void>;
  /** Applies a tap at once, stores it, and lets the queue send it (T-114). */
  tap(input: TapInput): Promise<TapResult>;
  /**
   * Adds, renumbers, renames or takes off players at the table (step 2.118), in order:
   * each change is a command with every promise a tap has (timed by the server's time,
   * checked against the contract and the rules, stored before it is shown, refused when
   * not scoring, listed not saved on a loss), in the same queue, in order with the taps.
   * Several changes (a line of numbers) are checked together: one that is not right
   * stores none.
   */
  changePlayers(changes: readonly PlayerChange[]): Promise<PlayersResult>;
  /** Takes the game from the holder shown, after the scorekeeper confirmed (T6 §5). */
  takeOver(): Promise<TakeOverResult>;
  /**
   * From read-only: asks for the game again. Signed out while scoring: checks at once
   * whether the scorekeeper is signed in again, and if so sends what is waiting.
   */
  openAgain(): Promise<void>;
  /** The network is back: send now and renew the session. */
  online(): void;
  /**
   * The page is shown again (`visibilitychange` to visible): the device may have slept.
   * The server's time is carried on across the sleep at once, then the session renewed
   * and what waits sent, as `online` does, so the time is measured again. The checks on
   * the session, stopped by `hidden`, start again from that renewal (T-295).
   */
  awake(): void;
  /**
   * The page is hidden (`visibilitychange` to hidden): the checks on the session stop, so
   * a tab nobody looks at asks nothing; `awake` asks at once when it is shown (T-295).
   */
  hidden(): void;
  /**
   * Takes back an End game tap that has not reached the server (step 2.37): on the device
   * alone, with no reason asked and with no signal. The game shown is live again, as it
   * was before the tap. If the server took the End meanwhile, nothing is taken back.
   */
  takeBackEnd(): Promise<TakeBackEndResult>;
  /**
   * Asks whether Reopen is offered to this account now and until when (S-36), so nobody
   * types a reason and is then told it is too late. Null when there was no answer.
   */
  reopenOffer(): Promise<ReopenOffer | null>;
  /**
   * Reopens a game the server has as final (step 2.120), once nothing is waiting to
   * send, and carries on scoring in place: the session is taken again and the game
   * loaded, with no "game over" notice between and no reload.
   */
  reopen(reason: string): Promise<ReopenResult>;
  /**
   * Marks a game that went live by mistake "not started" (step 2.121), once nothing is
   * waiting to send, and carries on in place with the scheduled game the server now has.
   */
  markNotStarted(reason?: NotStartedReason): Promise<MarkNotStartedResult>;
  /** The game was given a format before its first play (step 2.119): its state is read again. */
  formatChanged(): Promise<void>;
  /** The scorekeeper has read that the format was changed (T-344). */
  dismissFormatChanged(): Promise<void>;
  /**
   * The scorekeeper has seen the refused taps: they are dropped for good. `only`: just
   * these (an End game the screen has said was refused), the rest stay listed.
   */
  dismissNotApplied(only?: readonly string[]): Promise<void>;
  /** The scorekeeper has seen the taps not saved: they are dropped for good. */
  dismissNotSaved(): Promise<void>;
  /**
   * "Enter again" on a kept play, not saved or not applied (step 2.37, part 2; S-77):
   * only while this device holds the game, it is made again as a new play now, by the
   * path of `tap` (the same checks, and Undo takes it back), and leaves its list. The
   * clock, Undo, Redo, End game and changes of players are never entered again.
   */
  enterAgain(commandId: string): Promise<EnterAgainResult>;
  /**
   * "Send these plays" (S-43, T-335), offered while `status().sendNotSaved` is
   * `offered`: sends the plays listed as not saved, in order, telling the server the
   * state they were made on. The server takes them only if nothing was recorded since;
   * those taken leave the list. Otherwise they stay, to be entered again.
   */
  sendNotSaved(): Promise<SendNotSavedResult>;
  /**
   * Leaves the game. The session is released only when nothing is waiting to send;
   * otherwise its lease runs out by itself, and the same device opening the game again
   * carries on with it, so the waiting taps are still taken (record 036).
   */
  leave(): Promise<void>;
  status(): TrackerControllerStatus;
  subscribe(listener: (status: TrackerControllerStatus) => void): () => void;
  /** Resolves once nothing the controller started is under way. For tests. */
  idle(): Promise<void>;
};

/**
 * Whether a stored tap is one the device's engine applies: not a change of players at
 * the scorer's table (record 058), which the engine never sees, and not one of those
 * the server refuses.
 */
const isTap = (command: BatchCommand): command is TrackerCommand & { input: TapInput } =>
  !isTablePlayerCommand(command) &&
  command.input.type !== 'rules' &&
  command.input.type !== 'reopen' &&
  command.input.type !== 'reset';

/** The server's own refusal, as a door or the queue hands it on. */
type Rejection = {
  readonly httpStatus: number;
  readonly error?: TrackerRefusal['error'] | undefined;
};

/**
 * Whether a refusal means "sign in again", the taps held (M4): a 401, or any 404 that
 * does not say in its body that the game is gone (T-453). A league hidden from the
 * person (a draft or suspended one, a scorer signed out in another tab) is "not found"
 * at the league gate, the same answer as a missing league; only past the gate, to a
 * person who may open the league, does the server say `unknown-game`.
 */
const asksSignIn = (rejection: Rejection): boolean =>
  rejection.httpStatus === 401 ||
  (rejection.httpStatus === 404 && rejection.error !== 'unknown-game');

const reasonOfStatus = (rejection: Rejection): ReadOnlyReason => {
  const { httpStatus } = rejection;
  if (asksSignIn(rejection)) return 'signed-out';
  if (httpStatus === 403) return 'not-allowed';
  if (httpStatus === 404) return 'unknown-game';
  if (httpStatus === 409) return 'game-not-live';
  return 'request-refused';
};

const reasonOfHalt = (halt: QueueHalt): ReadOnlyReason | 'check-session' => {
  switch (halt.kind) {
    case 'refused':
      // `game-moved` answers only "send these plays", which the queue never sends.
      return halt.code === 'session-not-held' || halt.code === 'game-moved'
        ? 'check-session'
        : halt.code;
    case 'version-refused':
      return 'update-needed';
    case 'rejected':
      return reasonOfStatus(halt);
  }
};

/**
 * How long plays wait with no answer before the screen says they are only on this
 * device (T6 §4: "after several minutes offline"; S-77 in step 2.37, part 2).
 */
export const offlineLongMs = 5 * 60_000;

/**
 * How often a device showing a final game asks whether it still is, while its page is
 * shown (T-295): another device may have reopened it and scored, or ended it again.
 */
export const finalCheckMs = 15_000;

/** The reasons that mean another device may be scoring the game now. */
const lostTheGame: ReadonlySet<ReadOnlyReason> = new Set([
  'taken-over',
  'expired',
  'released',
  'not-held',
  'signed-in-as-other',
]);

/**
 * The reasons that mean the game can no longer be scored at all: decided, cancelled or
 * postponed, or no longer there. Once the device had the game, this is a loss too.
 */
const gameGone: ReadonlySet<ReadOnlyReason> = new Set(['game-not-live', 'unknown-game']);

/**
 * A game that is over is loaded whether or not this device had it (step 2.37, part 2):
 * a device that did not end it shows the final panel too (the score, who won, Reopen
 * for as long as the league allows; the review of the two doors, point 3).
 */
const losesTheGame = (reason: ReadOnlyReason, hadGame: boolean): boolean =>
  lostTheGame.has(reason) || reason === 'game-not-live' || (gameGone.has(reason) && hadGame);

/** `more` added to the end of `list`, leaving out any already in it. */
const withTaps = (list: readonly KeptTap[], more: readonly KeptTap[]): KeptTap[] => {
  const ids = new Set(list.map((t) => t.command.commandId));
  const added = more.filter((t) => {
    if (ids.has(t.command.commandId)) return false;
    ids.add(t.command.commandId);
    return true;
  });
  return [...list, ...added];
};

/** `list` without the taps whose command IDs are in `ids`. */
const withoutTaps = (list: readonly KeptTap[], ids: ReadonlySet<string>): KeptTap[] =>
  list.filter((t) => !ids.has(t.command.commandId));

/** How often "Send these plays" sends its list at most, while it is refused (T-374). */
const sendPasses = 3;

const keptIn = (list: readonly QueuedCommand[], state: QueuedCommand['state']) =>
  list.filter((entry) => entry.state === state).map(keptTap);

const tapsIn = (list: readonly QueuedCommand[], state: QueuedCommand['state']) =>
  keptIn(list, state).map((t) => t.command);

/** Where in `game` a tap made at `at` (server time) falls: its period and game clock. */
const momentIn = (game: basketball.GameState, at: number): GameMoment => ({
  period: basketball.derive(game).period,
  clockMs: basketball.clockAt(game, at).remainingMs,
});

const lowerUuid = (): string => globalThis.crypto.randomUUID().toLowerCase();

/**
 * How much less sure a measurement of the server's time is taken to grow per
 * millisecond it ages (finding L4): a second a quarter of an hour. Far more than a
 * device's clock drifts, so a fresh reply replaces an old close one within minutes.
 */
const clockAgingPerMs = 1 / 900;

/**
 * How far the wall clock must run ahead of the steady clock between two looks before
 * the device is taken to have slept (the review's Medium): well above the jitter of
 * either clock, well below a locked tablet's sleep.
 */
const sleepMarginMs = 3_000;

export function createTrackerController(options: TrackerControllerOptions): TrackerController {
  const {
    gameId,
    deviceId,
    storage,
    transport,
    server,
    clock = browserClock,
    newCommandId = lowerUuid,
    newPlayerId = lowerUuid,
    random = Math.random,
    retry = defaultRetryTiming,
    requestTimeoutMs = 15_000,
    renewEveryMs = sessionRenewSeconds * 1000,
    wallClock = () => Date.now(),
  } = options;

  let sessionId: string | null = null;
  /**
   * Server time less steady-clock time, from the closest recent session reply (T-121,
   * record 036, findings M3 and L4), and how sure that is: its error, and when it was
   * measured (steady clock). Null until a reply has been timed.
   */
  let offsetMs = 0;
  let measured: { readonly errorMs: number; readonly at: number } | null = null;
  /**
   * How far the wall clock has been ahead of the steady clock, at most, at any look: a
   * sleep shows as that lead growing. The most, not the last, so a wall clock put back
   * by hand and later set right again is never taken for a sleep.
   */
  let wallLead: number | null = null;
  /** Looks at both clocks; the lead the wall clock has grown by since, beyond the most seen. */
  const lookNow = (): number => {
    const lead = wallClock() - clock.now();
    const grown = wallLead === null ? 0 : lead - wallLead;
    wallLead = wallLead === null ? lead : Math.max(wallLead, lead);
    return grown;
  };
  /**
   * Did the device sleep since the last look? On some devices (iPads, Macs) the steady
   * clock stands still while the device sleeps, so a tablet locked at half-time would
   * wake with `now()` behind by the whole sleep, and time every tap that early until a
   * session reply came back. When the wall clock has gone on by clearly more than the
   * steady clock (`sleepMarginMs`), the difference is the sleep: it is added to the
   * offset, and the error widened by the margin, so `now()` carries on from the right
   * time. A wall clock that went back, on by less than the margin, or back to where it
   * was after being put back, is not trusted. (A hand change of the device's clock
   * forward, past where it ever was, while the tracker is open looks like a sleep, and
   * is corrected by the next session reply.)
   */
  const noticeSleep = (): void => {
    const slept = lookNow();
    if (measured === null || slept <= sleepMarginMs) return;
    offsetMs += Math.round(slept);
    measured = { errorMs: measured.errorMs + sleepMarginMs, at: clock.now() };
    update({ clockErrorMs: measured.errorMs });
  };
  /** The latest `now()` given: it never goes back (L4). */
  let latestNow = 0;
  const serverNow = (): number => {
    noticeSleep();
    latestNow = Math.max(latestNow, Math.round(clock.now() + offsetMs));
    return latestNow;
  };
  /** A moment on the steady clock, on the server's clock as last measured. */
  const onServerClock = (steady: number): number => Math.max(0, Math.round(steady + offsetMs));
  /** When the queue last said the server has taps of this device (steady clock). */
  let seenSavedAt: number | null = null;
  let base: ServerState | null = null;
  /** This device's taps since `base`, in order: the ones the server took and the waiting. */
  let made: BatchCommand[] = [];
  /** Every tap the server refused: never replayed. */
  const refusedIds = new Set<string>();
  /** Set while opening is settled: the last judging of the commands since could not tell. */
  let couldNotTell = false;
  let stopped = false;
  let failures = 0;
  let cancelTimer: (() => void) | null = null;
  /** What the timer will run: asked for at once when the network is back. */
  let retrying: (() => Promise<void>) | null = null;
  let cancelRenew: (() => void) | null = null;
  let checkingHalt = false;
  /** Times the queue was let go again after "not held" while the renewal said held. */
  let resumedAfterNotHeld = 0;
  const underWay = new Set<Promise<unknown>>();
  const listeners = new Set<(status: TrackerControllerStatus) => void>();

  const queue: TrackerQueue = createTrackerQueue({
    gameId,
    storage,
    transport,
    clock,
    random,
    sessionId: () => sessionId,
    ...options.queue,
  });

  let current: TrackerControllerStatus = {
    mode: { kind: 'opening' },
    game: null,
    serverSequence: null,
    corrections: [],
    notApplied: [],
    notSaved: [],
    cannotTell: false,
    sendNotSaved: 'none',
    waiting: [],
    lastSavedAt: null,
    signedOut: false,
    reloading: false,
    offlineLong: false,
    queue: queue.status(),
    now: serverNow,
    clockErrorMs: null,
    rosters: options.rosters?.page ?? null,
    formatChangedTo: null,
  };

  const update = (change: Partial<TrackerControllerStatus>): void => {
    current = { ...current, ...change };
    for (const listener of listeners) listener(current);
  };

  /** Keeps track of work under way, so `idle` can wait for it. */
  const track = <T>(work: Promise<T>): Promise<T> => {
    underWay.add(work);
    void work.finally(() => underWay.delete(work)).catch(() => undefined);
    return work;
  };

  /** One change to the game at a time: taps and rebuilds never interleave. */
  let chain: Promise<unknown> = Promise.resolve();
  const serially = <T>(work: () => T | Promise<T>): Promise<T> => {
    const next = chain.then(work);
    chain = next.catch(() => undefined);
    return track(next);
  };

  /** Asks the server, giving up after `requestTimeoutMs`. */
  const ask = async <T>(
    request: (signal: AbortSignal) => Promise<ServerOutcome<T>>,
  ): Promise<ServerOutcome<T>> => {
    const abort = new AbortController();
    let cancel = (): void => undefined;
    const timedOut = new Promise<ServerOutcome<T>>((resolve) => {
      cancel = clock.after(requestTimeoutMs, () => {
        abort.abort();
        resolve({ kind: 'unanswered' });
      });
    });
    try {
      const answered = request(abort.signal).catch(
        (): ServerOutcome<T> => ({ kind: 'unanswered' }),
      );
      return await Promise.race([answered, timedOut]);
    } finally {
      cancel();
    }
  };

  /**
   * The server stamped `serverAt` somewhere between `sent` and `received` (steady
   * clock): taken as the midpoint, it is off by at most half the round trip (T-121,
   * finding M1). It replaces what is known only when it is closer than that has become
   * with age, or the two disagree beyond both their errors (the device slept and its
   * steady clock stood still, say), so the closer one is kept (finding L4).
   */
  const timeServer = (sent: number, received: number, serverAt: number): void => {
    const errorMs = Math.max(received - sent, 0) / 2;
    const offset = Math.round(serverAt - (sent + errorMs));
    if (measured === null) {
      // The first measurement: `now()` was the device's own time until now, and is
      // set right even if that is back (nothing has been timed by it yet).
      latestNow = 0;
    } else {
      const agedMs = measured.errorMs + Math.max(received - measured.at, 0) * clockAgingPerMs;
      const agree = Math.abs(offset - offsetMs) <= agedMs + errorMs;
      if (agree && errorMs > agedMs) return;
    }
    offsetMs = offset;
    measured = { errorMs, at: received };
    // A sleep before this measurement is in it already: look from here, adding nothing.
    lookNow();
    // A save made since this request went out is put on this measurement: the one
    // before may no longer hold (after the device slept offline, say), and the time of
    // the last save is the server's, not the device's (finding L5).
    const savedSince = seenSavedAt !== null && seenSavedAt >= sent ? seenSavedAt : null;
    if (savedSince !== null) {
      update({ clockErrorMs: errorMs, lastSavedAt: onServerClock(savedSince) });
    } else if (current.clockErrorMs !== errorMs) {
      update({ clockErrorMs: errorMs });
    }
  };

  const session = (request: SessionRequest) => {
    const sent = clock.now();
    return ask((signal) => server.session(request, signal)).then((outcome) => {
      // Answered: the banner no longer says "No connection" for sends of long ago (M2).
      if (outcome.kind !== 'unanswered') queue.heard();
      if (outcome.kind === 'answer') timeServer(sent, clock.now(), outcome.value.sentAt);
      return outcome;
    });
  };

  const waitingTaps = async (): Promise<BatchCommand[]> =>
    tapsIn(await storage.list(gameId), 'waiting');

  /** The base with every tap of `taps` the engine takes on it, in order. */
  const replay = (from: ServerState, taps: readonly BatchCommand[]): basketball.GameState => {
    let state = from.state;
    for (const command of taps) {
      if (!isTap(command)) continue;
      try {
        state = basketball.apply(state, command.input, {
          id: command.commandId.toLowerCase(),
          now: command.at,
        });
      } catch (thrown) {
        // The server will judge it too, and its refusal will be listed (T-113).
        if (!(thrown instanceof basketball.TrackerError)) throw thrown;
      }
    }
    return state;
  };

  /** The kept scoring, written one after another so an older one never lands last. */
  let keeping: Promise<void> = Promise.resolve();
  const keepScoringNow = (): void => {
    const keep = options.keepScoring;
    if (keep === undefined || sessionId === null) return;
    const scoring: DeviceScoring = { sessionId, onTop: [...made] };
    // Best effort: the taps themselves are in the queue, which says when storage fails.
    keeping = keeping.then(() => keep(scoring)).catch(() => undefined);
  };
  /** After every keeping under way, so a kept scoring never lands after the forgetting. */
  const forgetScoringNow = (): Promise<void> => {
    const forget = options.forgetScoring;
    if (forget === undefined) return Promise.resolve();
    keeping = keeping.then(() => forget()).catch(() => undefined);
    return keeping;
  };

  const showGame = (): void => {
    if (base === null) return;
    update({
      game: replay(base, made),
      serverSequence: base.sequence,
      corrections: base.corrections ?? [],
    });
    keepScoringNow();
  };

  /**
   * The server did not answer on opening (step 2.38, finding M5): with the state and the
   * session the device kept, scoring starts from them at once, the kept taps on top,
   * under the kept session, so a reload with no signal carries on within seconds. The
   * queue sends under that session as the network allows, and the server takes them if
   * nobody took the game (T-248); opening goes on being asked, and once answered the
   * game is settled as on any opening (`hold`, then the server's state; T-253).
   */
  let fromDevice = false;
  /**
   * The kept session scored under until opening is answered. A send or renewal under it
   * that the server refuses (it ended while the device was away) decides nothing: the
   * device's taps are settled by opening (`hold`), which knows whether the server gave
   * this device a new session or somebody else holds the game. Treated as a loss, the
   * taps were listed not saved though nobody took the game (step 2.38, part 6).
   */
  let keptSession: string | null = null;
  /** Openings under way (asked, or answered and being settled). */
  let opening = 0;
  const settleByOpening = async (): Promise<void> => {
    if (opening > 0 || stopped) return;
    clearTimer();
    return open();
  };
  const startFromDevice = async (): Promise<void> => {
    const kept = options.kept;
    if (fromDevice || stopped || base !== null || kept === undefined) return;
    const { state, scoring } = kept;
    if (state === null || scoring === null || state.state.status === 'final') return;
    fromDevice = true;
    let waiting: BatchCommand[];
    // A kept tap the queue holds as not saved or refused was listed when the game was
    // lost: it is never counted again on the screen (review M3).
    let settled: Set<string>;
    try {
      const held = await storage.list(gameId);
      waiting = held
        .filter(
          (entry) =>
            entry.state === 'waiting' &&
            (entry.sessionId === undefined || entry.sessionId === scoring.sessionId),
        )
        .map((entry) => entry.command);
      settled = new Set(
        held.filter((entry) => entry.state !== 'waiting').map((entry) => entry.command.commandId),
      );
    } catch {
      return;
    }
    if (stopped || base !== null || current.mode.kind !== 'opening') return;
    const onTop = new Set(scoring.onTop.map((c) => c.commandId));
    // A kept tap the kept state has already (its load was kept, the scoring not yet) is
    // not counted twice.
    const inState = new Set(state.state.recent.map((id) => id.toLowerCase()));
    made = [...scoring.onTop, ...waiting.filter((c) => !onTop.has(c.commandId))].filter(
      (c) =>
        !refusedIds.has(c.commandId) &&
        !settled.has(c.commandId) &&
        !inState.has(c.commandId.toLowerCase()),
    );
    base = state;
    sessionId = scoring.sessionId;
    lastHeldSession = scoring.sessionId;
    keptSession = scoring.sessionId;
    // The rosters this device last kept for this account, not the page's copy, which a
    // worker may have kept from before a fetch (step 2.118).
    const keptRosters = options.rosters?.kept;
    if (keptRosters !== undefined && keptRosters !== null) keepRosters(keptRosters);
    showGame();
    update({ mode: { kind: 'scoring' } });
  };

  const clearTimer = (): void => {
    cancelTimer?.();
    cancelTimer = null;
    retrying = null;
  };

  /** Runs `work` again after a wait that doubles while the server does not answer. */
  const later = (work: () => Promise<void>): void => {
    clearTimer();
    if (stopped) return;
    failures += 1;
    retrying = work;
    cancelTimer = clock.after(retryDelayMs(failures, random(), retry), () => {
      cancelTimer = null;
      retrying = null;
      void track(work());
    });
  };

  /** The page is hidden: the session is not checked until it is shown (T-295). */
  let pageHidden = false;
  const scheduleRenew = (): void => {
    cancelRenew?.();
    cancelRenew = null;
    if (stopped || sessionId === null || pageHidden) return;
    cancelRenew = clock.after(renewEveryMs, () => {
      cancelRenew = null;
      void track(renew());
    });
  };

  /**
   * Lets the session go: nothing more is sent or renewed, and nothing waits to be
   * asked again (a reload after a refusal included, so it is no longer shown).
   */
  const stopScoring = (): void => {
    sessionId = null;
    cancelRenew?.();
    cancelRenew = null;
    cancelSettle?.();
    cancelSettle = null;
    clearTimer();
    if (current.reloading) update({ reloading: false });
  };

  /**
   * No longer scoring: nothing more is sent. Only when the game was lost (another
   * device may have it, or it was decided or is gone while this device had it) is what
   * was waiting listed as not saved and the server's state shown. For any other reason
   * (the storage failed, say) the waiting taps stay shown and are sent on opening again
   * into the same session, so they are not listed: listing them would invite entering
   * them twice. `gameWasLost`: another device had the game already (a takeover was
   * turned away), so the loss is finished whatever the reason (finding L2).
   */
  const readOnly = async (reason: ReadOnlyReason, gameWasLost = false): Promise<void> => {
    const hadGame = base !== null || made.length > 0;
    stopScoring();
    update({ mode: { kind: 'read-only', reason }, signedOut: false });
    if (gameWasLost || losesTheGame(reason, hadGame)) await lost();
    // Shown final: asked about again, as another device may reopen it (T-295).
    scheduleFinalCheck();
  };

  /** Signed out while scoring (finding M4): keep scoring, hold the taps, keep the session. */
  const signedOutWhileScoring = (): void => {
    if (!current.signedOut) update({ signedOut: true });
  };

  /** Runs at once what was waiting to be asked again. */
  const askAgainNow = (): void => {
    const run = retrying;
    if (run === null) return;
    failures = 0;
    clearTimer();
    void track(run());
  };

  /** Signed in again: send what waited, and ask again now for what was put off. */
  const signedInAgain = (): void => {
    if (!current.signedOut) return;
    update({ signedOut: false });
    queue.resume();
    askAgainNow();
  };

  /** The mode as it is now: read through a call, as it may change while work waits. */
  const modeNow = (): ControllerMode => current.mode;

  /** Still not scoring: neither opening again nor taking over has begun since. */
  const stillLost = (): boolean =>
    current.mode.kind === 'read-only' || current.mode.kind === 'held-by-other';

  /**
   * Taps the scorekeeper has dismissed from the not-saved list: never listed again, even
   * by a read of the storage made before they were dropped from it (finding L3).
   */
  const dismissed = new Set<string>();

  /** Shows `list` as the taps not saved, less any the scorekeeper has dismissed. */
  const listNotSaved = (list: readonly KeptTap[]): void => {
    showNotSaved(withoutTaps(list, dismissed));
  };

  /**
   * "Send these plays" (S-43, T-335): the sequence of the server's state the plays
   * listed as not saved were made on, once a loss listed them on this device; null
   * when unknown (listed before a reload), when "Send these plays" is not offered.
   */
  let notSavedSince: number | null = null;
  /** Plays of that list the server took meanwhile (an uploaded copy): sent along, as own (T-370). */
  let takenOfList: KeptTap['command'][] = [];
  /** The last session this device held: the batch names it, though the server goes by the sequence. */
  let lastHeldSession: string | null = null;
  /** The session the list was made under (T-373): named by its send, not one taken since. */
  let listSession: string | null = null;
  /** Keeps taps of the list the server took as taken, so a reload still sends them (T-373). */
  const keepTaken = (taps: readonly KeptTap['command'][]): Promise<void> =>
    queue
      .keepTaken(taps.map((command) => ({ protocolVersion: trackerProtocolVersion, command })))
      .catch(() => undefined);

  /**
   * Keeps waiting taps as not saved, with the sequence the list was made on when it is
   * known, so "Send these plays" is still offered after a reload (T-337).
   */
  const putAside = (commandIds: readonly string[]): Promise<void> =>
    queue.setAside(commandIds, notSavedSince ?? undefined);

  /**
   * After a reload: the sequence the kept list was made on, and the session it was made
   * under, as the storage kept them with it (T-337). The earliest any of them names, so a
   * send is refused rather than a play counted twice; unknown when one names none.
   */
  const restoreNotSavedSince = (held: readonly QueuedCommand[]): void => {
    const kept = held.filter((entry) => entry.state === 'not-saved');
    if (kept.length === 0 || current.notSaved.length > 0) return;
    let since: number | null = null;
    let session: string | null = null;
    for (const entry of kept) {
      if (entry.state !== 'not-saved' || entry.notSavedSince === undefined) return;
      if (entry.sessionId === undefined) return;
      if (since === null || entry.notSavedSince < since) {
        since = entry.notSavedSince;
        session = entry.sessionId;
      }
    }
    notSavedSince = since;
    listSession = session;
    takenOfList = tapsIn(held, 'taken');
  };

  /** Lists `list` as not saved, and says whether "Send these plays" is offered for it. */
  const showNotSaved = (list: readonly KeptTap[]): void => {
    if (list.length === 0) {
      // Taken taps are kept only beside a list: gone with it (T-373).
      const gone = takenOfList.map((c) => c.commandId);
      [notSavedSince, takenOfList, listSession] = [null, [], null];
      if (gone.length > 0) void queue.forget(gone).catch(() => undefined);
    }
    if (list.length === 0 && current.cannotTell) update({ cannotTell: false });
    const was = current.sendNotSaved;
    const sendNotSaved: SendNotSavedOffer =
      list.length === 0 || notSavedSince === null ? 'none' : was === 'none' ? 'offered' : was;
    update({ notSaved: list, sendNotSaved });
  };

  /**
   * A tap listed as not saved that the server's state holds was taken though its answer
   * never came back: it is saved. It leaves the list and the storage, so it is never
   * entered twice (finding M1).
   */
  const dropTaken = async (state: ServerState): Promise<void> => {
    const taken = new Set(state.state.recent.map((id) => id.toLowerCase()));
    const saved = current.notSaved
      .map((t) => t.command.commandId)
      .filter((id) => taken.has(id.toLowerCase()));
    if (saved.length === 0) return;
    const took = current.notSaved
      .filter((t) => saved.includes(t.command.commandId))
      .map((t) => t.command);
    takenOfList.push(...took);
    showNotSaved(withoutTaps(current.notSaved, new Set(saved)));
    if (current.notSaved.length > 0) await keepTaken(took);
    else await queue.forget(saved).catch(() => undefined);
  };

  // --- The rosters (step 2.118): kept, fetched, and listed with the waiting changes. ---

  /** The rosters the device keeps: the page's, a fetched one, with changes taken since. */
  let storedRosters: DeviceRosters | null = options.rosters?.page ?? null;
  /** Fetches of the rosters begun so far: a change taken is laid on those begun before. */
  let rosterAsks = 0;
  /** Changes the server took, each with the fetches begun when it was taken. */
  let takenSince: { readonly command: TablePlayerCommand; readonly asks: number }[] = [];
  let keepingRosters: Promise<void> = Promise.resolve();

  /** The kept rosters with this device's waiting changes on top: what is listed. */
  const showRosters = (): void => {
    if (storedRosters === null) return;
    const waiting = playerChangesIn(queue.status().waitingTaps);
    update({ rosters: withChanges(storedRosters, waiting, gameId) });
  };
  const keepRosters = (rosters: DeviceRosters): void => {
    storedRosters = rosters;
    const keep = options.rosters?.keep;
    // Best effort, one after another: the changes themselves are in the queue.
    if (keep !== undefined)
      keepingRosters = keepingRosters.then(() => keep(rosters)).catch(() => undefined);
    showRosters();
  };

  /**
   * A change of players listed as not saved that the server's rosters already show (an
   * add whose player is there, a fix they wear, a take-off whose player is gone) was
   * taken though its answer never came back: it is saved, and leaves the list and the
   * storage.
   */
  const changesTakenIn = (rosters: DeviceRosters, list: readonly KeptTap[]): string[] =>
    playerChangesIn(list)
      .filter((c) => changeIsIn(rosters, c.input))
      .map((c) => c.commandId);

  let fetchingRosters: Promise<DeviceRosters | null> | null = null;
  let fetchRostersAgain = false;
  /**
   * Fetches the rosters (on opening, taking over, after a loss, after a refused change,
   * back online): kept, with the changes taken since the fetch began laid on them. One
   * at a time; asked again meanwhile, it fetches once more. The rosters fetched, or null.
   */
  const refreshRosters = (): Promise<DeviceRosters | null> => {
    const load = server.loadRosters?.bind(server);
    if (load === undefined || storedRosters === null || stopped) return Promise.resolve(null);
    if (fetchingRosters !== null) {
      fetchRostersAgain = true;
      return fetchingRosters;
    }
    const run = async (): Promise<DeviceRosters | null> => {
      let fetched: DeviceRosters | null = null;
      do {
        fetchRostersAgain = false;
        rosterAsks += 1;
        const asks = rosterAsks;
        const outcome = await ask((signal) => load(signal));
        if (outcome.kind !== 'answer' || storedRosters === null || stopped) continue;
        fetched = refreshedRosters(storedRosters, outcome.value);
        takenSince = takenSince.filter((t) => t.asks >= asks);
        keepRosters(
          withChanges(
            fetched,
            takenSince.map((t) => t.command),
            gameId,
          ),
        );
        const saved = changesTakenIn(fetched, current.notSaved);
        if (saved.length > 0) {
          showNotSaved(withoutTaps(current.notSaved, new Set(saved)));
          await queue.forget(saved).catch(() => undefined);
        }
      } while (fetchRostersAgain);
      return fetched;
    };
    const running = track(run()).finally(() => {
      fetchingRosters = null;
    });
    fetchingRosters = running;
    return running;
  };

  // The queue's changes of players: one taken is laid on the kept rosters; a refused one
  // has the rosters fetched again (the server's are the truth).
  let seenWaitingChanges: TablePlayerCommand[] = [];
  /** The stale changes `hold` sets aside before it lists them: never counted as taken. */
  const settingAside = new Set<string>();
  const seenRefusedChanges = new Set<string>();
  queue.subscribe((status) => {
    const waiting = playerChangesIn(status.waitingTaps);
    const stillWaiting = new Set(waiting.map((c) => c.commandId));
    const refused = new Set(status.refused.map((r) => r.command.commandId));
    const listed = new Set(current.notSaved.map((t) => t.command.commandId));
    // Gone from the waiting ones, neither refused, nor listed as not saved, nor being set
    // aside to be listed (`hold`): taken.
    const taken = seenWaitingChanges.filter(
      (c) =>
        !stillWaiting.has(c.commandId) &&
        !refused.has(c.commandId) &&
        !listed.has(c.commandId) &&
        !settingAside.has(c.commandId),
    );
    seenWaitingChanges = waiting;
    const refusedNow = status.refused.filter(
      (r) => isTablePlayerCommand(r.command) && !seenRefusedChanges.has(r.command.commandId),
    );
    for (const r of refusedNow) seenRefusedChanges.add(r.command.commandId);
    if (taken.length > 0 && storedRosters !== null) {
      takenSince = [...takenSince, ...taken.map((command) => ({ command, asks: rosterAsks }))];
      keepRosters(withChanges(storedRosters, taken, gameId));
    } else {
      showRosters();
    }
    if (refusedNow.length > 0) void refreshRosters();
  });

  /**
   * The game was lost (T6 §5): what this device had not sent is listed as not saved,
   * added to what was listed before, and set aside in the storage so it is never sent
   * and a reload keeps the list. The server's state is shown, since another device may
   * be scoring it, or the game is over.
   */
  const lost = async (): Promise<void> => {
    // The server's state as this device last knew it, before anything here loads the
    // new holder's: what its waiting taps were made on, for "Send these plays" (T-335).
    const madeOn = knownSequence();
    // What the device kept of its scoring under the lost session goes (review M3).
    await forgetScoringNow();
    // A batch already on its way may still be taken: wait for its answer, so a tap the
    // server took is not listed. Nothing more is sent, as the session is let go.
    await queue.idle();
    const held = await storage.list(gameId).catch(() => null);
    if (!stillLost()) return;
    if (held !== null) {
      // A change of players the server took whose answer was lost (an add, a fix, a
      // take-off) is checked against its rosters before it is called not saved (step
      // 2.118); unanswered, it is listed.
      const unsentAll = keptIn(held, 'waiting');
      const changes = playerChangesIn(unsentAll).length > 0;
      const rosters = changes ? await refreshRosters() : null;
      if (!stillLost()) return;
      const takenAdds = new Set(rosters === null ? [] : changesTakenIn(rosters, unsentAll));
      const waiting = unsentAll.filter((t) => !takenAdds.has(t.command.commandId));
      const unsent = new Set(unsentAll.map((t) => t.command.commandId));
      made = made.filter((c) => !unsent.has(c.commandId));
      // Known only for a first loss whose taps were all waiting here: a list that already
      // held plays (listed before a reload, or an earlier loss) keeps what it had.
      const keptNotSaved = keptIn(held, 'not-saved');
      if (current.notSaved.length === 0 && keptNotSaved.length === 0 && waiting.length > 0) {
        notSavedSince = madeOn;
        listSession = lastHeldSession;
      }
      listNotSaved(withTaps(withTaps(current.notSaved, keptNotSaved), waiting));
      // If this fails they are still listed, and never sent under another session.
      if (unsent.size > 0) await putAside([...unsent]).catch(() => undefined);
      // Saved after all: never sent again, never listed.
      if (takenAdds.size > 0) await queue.forget([...takenAdds]).catch(() => undefined);
      if (!stillLost()) return;
    }
    showGame();
    const loaded = await ask((signal) => server.loadState(signal));
    if (loaded.kind !== 'answer' || !stillLost()) return;
    await dropTaken(loaded.value);
    if (!stillLost()) return;
    // This device's taps the server took since its base go with "Send these plays" (T-370):
    // every one it answered (none is still waiting here), not only those among the state's
    // recent ids, which name the last 300 plays only (T-374).
    if (current.notSaved.length > 0) {
      const answered = made.filter((c) => !refusedIds.has(c.commandId));
      takenOfList.push(...answered);
      await keepTaken(answered);
    }
    base = loaded.value;
    made = [];
    showGame();
  };

  /** Sends plays listed as not saved, by "Send these plays" only (T-335), through the commands door. */
  const sendPlays = (batch: CommandBatch) =>
    ask(async (signal): Promise<ServerOutcome<CommandReply>> => {
      const sent = await transport.send(batch, signal);
      if (sent.kind === 'reply') return { kind: 'answer', value: sent.reply };
      if (sent.kind === 'unanswered') return { kind: 'unanswered' };
      if (sent.kind === 'rejected') {
        return { kind: 'rejected', httpStatus: sent.httpStatus, error: sent.error };
      }
      return { kind: 'rejected', httpStatus: 'httpStatus' in sent ? sent.httpStatus : 426 };
    });

  const scoringNow = (): boolean => current.mode.kind === 'scoring';

  /** After "Send these plays": the server's game shown again, as it is now. */
  const showServerGame = async (): Promise<void> => {
    if (current.mode.kind === 'scoring') {
      await load();
      return;
    }
    const loaded = await ask((signal) => server.loadState(signal));
    // Taken back while the state was asked for: scoring loads it its own way.
    if (loaded.kind !== 'answer' || scoringNow()) return;
    await serially(() => {
      base = loaded.value;
      made = [];
      showGame();
    });
  };

  /**
   * What a session reply that is not "held by you" means for this device.
   * `gameWasLost`: as for `readOnly` (the reply turned a takeover away).
   */
  const notHeld = async (
    reply: Exclude<SessionReply, { status: 'held-by-you' }>,
    gameWasLost = false,
  ) => {
    switch (reply.status) {
      case 'held-by-other': {
        stopScoring();
        // Still held by the same device after a reopen from here: that is still said.
        const was = current.mode;
        const reopened =
          was.kind === 'held-by-other' &&
          was.reopened === true &&
          was.holder.displayName === reply.holder.displayName
            ? ({ reopened: true } as const)
            : {};
        update({ mode: { kind: 'held-by-other', holder: reply.holder, ...reopened } });
        return lost();
      }
      case 'ended':
        // Signed out until this answer: the account signed in now is not the one the
        // session was taken under, or another device took over meanwhile (L5).
        return readOnly(
          current.signedOut && reply.reason === 'taken-over' ? 'signed-in-as-other' : reply.reason,
          gameWasLost,
        );
      case 'refused':
        // An archived season's game cannot be scored now: the tracker says so as for a
        // game that is over (T-390).
        return readOnly(
          reply.code === 'season-archived' ? 'game-not-live' : reply.code,
          gameWasLost,
        );
    }
  };

  /**
   * Loads the server's state and rebuilds the game on it. The taps kept on top are
   * those the state does not have: made after the load began, or still waiting when
   * it began (a tap the server took before then is in the state).
   */
  const load = async (): Promise<boolean> => {
    // The taps made before the load began, by id: `made` may lose some (a refusal) or
    // gain some (new taps) while the load is under way, so a count would not do.
    const madeBefore = new Set(made.map((c) => c.commandId));
    // If the storage cannot be read, every tap is kept unless the state has it.
    const waiting = await waitingTaps().then(
      (taps) => new Set(taps.map((c) => c.commandId)),
      () => null,
    );
    const loaded = await ask((signal) => server.loadState(signal));
    if (loaded.kind === 'unanswered') return false;
    if (loaded.kind === 'rejected') {
      if (asksSignIn(loaded) && current.mode.kind === 'scoring') {
        // Still scoring (M4): asked again later, and at once on signing in again.
        signedOutWhileScoring();
        return false;
      }
      await readOnly(reasonOfStatus(loaded));
      return true;
    }
    await serially(() => {
      // Two loads can be under way at once (one after a refusal, one for a game not
      // started) and be answered out of order: an answer older than the state the game
      // is built on now is left, or the taps the server took since would vanish from the
      // screen until the next load.
      if (base !== null && loaded.value.sequence < base.sequence) return;
      const taken = new Set(loaded.value.state.recent.map((id) => id.toLowerCase()));
      made = made.filter(
        (c) =>
          !taken.has(c.commandId.toLowerCase()) &&
          !refusedIds.has(c.commandId) &&
          (!madeBefore.has(c.commandId) || waiting === null || waiting.has(c.commandId)),
      );
      const playing = base?.state.rules;
      base = loaded.value;
      // The server's rules are taken at once; told when they are not those played (T-344).
      if (playing !== undefined && !sameData(playing, base.state.rules)) {
        update({ formatChangedTo: formatOf(base.state.rules) });
      }
      showGame();
    });
    // A tap listed as not saved that the state has is saved after all (finding M1).
    await dropTaken(loaded.value);
    return true;
  };

  /** Holding the session: load the game and score. */
  const scoreWith = async (held: string): Promise<void> => {
    if (stopped) {
      // Left while the session was being asked for: let it go as leaving does.
      if (queue.status().waiting === 0) await session({ type: 'release', sessionId: held });
      return;
    }
    sessionId = held;
    lastHeldSession = held;
    keptSession = null;
    resumedAfterNotHeld = 0;
    scheduleRenew();
    const loading = async (): Promise<void> => {
      if (!(await load())) return later(loading);
      failures = 0;
      if (sessionId === null) return;
      update({ mode: { kind: 'scoring' } });
      queue.resume();
    };
    await loading();
  };

  /**
   * The server gave this device a new session `held` while taps made under its earlier
   * one wait (step 2.38): that one ended with the device away (released as the page
   * reloaded with no signal, say). The server gives a session only to this device and
   * account, so if nobody else scored since the state the device last knew, the taps
   * fit the game as it is: they are moved to the new session in the storage and sent,
   * neither lost nor listed. Otherwise somebody else took the game, and they are listed
   * as not saved. With no answer, opening is asked again before anything is decided.
   * Whose the commands since were is judged by ID (T-357): this device's own are those it
   * made, kept or stored, refused ones included. When the server's lists are too short to
   * tell, somebody else may have scored: listed (`cannotTell`) to enter again, never sent
   * and never offered to send (T-358).
   */
  const carryOnTaps = async (
    held: string,
    stale: readonly KeptTap[],
    stored: ReadonlySet<string>,
  ): Promise<'carried' | 'taken' | 'unanswered'> => {
    couldNotTell = false;
    const from = base ?? options.kept?.state ?? null;
    if (from === null) return 'taken';
    const loaded = await ask((signal) => server.loadState(signal));
    if (loaded.kind === 'unanswered') return 'unanswered';
    if (loaded.kind === 'rejected') return 'taken';
    const ownCommands = [
      ...made,
      ...(options.kept?.scoring?.onTop ?? []),
      ...stale.map((t) => t.command),
    ];
    const own = new Set(
      [...ownCommands.map((c) => c.commandId), ...stored, ...refusedIds].map((id) =>
        id.toLowerCase(),
      ),
    );
    const since = commandsSince(from, loaded.value, own);
    if (since === 'cannot-tell') couldNotTell = true;
    if (since !== 'own') return 'taken';
    await queue.carryOn(
      stale.map((t) => t.command.commandId),
      held,
    );
    return 'carried';
  };

  /**
   * The server gave this device the session `held`. A waiting tap made under another
   * session was made when that one lost the game (or a closed tab's session did since):
   * it is never sent under this one (T6 §5, record 049). It is set aside in the queue's
   * storage and listed as not saved, so it can be entered again. Every other waiting
   * tap goes.
   */
  const hold = async (held: string): Promise<void> => {
    const madeUnder = (entry: QueuedCommand) =>
      entry.sessionId === undefined || entry.sessionId === held;
    // A batch the old session sent may still be on its way, and be taken: wait for its
    // answer first, so a tap the server took is never listed (finding M1), as `lost` does.
    await queue.idle();
    let stale: KeptTap[];
    let setAside: KeptTap[];
    let stored: Set<string>;
    try {
      const list = await storage.list(gameId);
      stored = new Set(list.map((entry) => entry.command.commandId));
      setAside = keptIn(list, 'not-saved');
      stale = list.filter((entry) => entry.state === 'waiting' && !madeUnder(entry)).map(keptTap);
    } catch {
      // Not known to be dropped, so nothing may be sent: the session is not used, and
      // its lease runs out unless opening again (into the same session) gets this far.
      return readOnly('storage-failed');
    }
    if (stale.length > 0) {
      const carried = await carryOnTaps(held, stale, stored).catch(() => 'storage-failed' as const);
      if (carried === 'storage-failed') return readOnly('storage-failed');
      // Asked again: the server gives this device the same session while it holds it.
      if (carried === 'unanswered') return later(open);
      // Carried: the storage holds them under `held` now, read again below.
      if (carried === 'carried') stale = [];
    }
    // Listed because whose the commands since were could not be told (T-357): "Enter
    // again" only, never "Send these plays" (T-358, review M1): the session they were made
    // under has ended, so the server would refuse the send nearly always. Nothing here
    // sets an offer, so none is left up when the taps are judged again (review M2).
    // Set aside, then listed: meanwhile the queue's listener must not take a stale change
    // of players for one taken (review M1 of step 2.118).
    const staleIds = stale.map((t) => t.command.commandId);
    for (const id of staleIds) settingAside.add(id);
    try {
      if (stale.length > 0) await putAside(staleIds);
    } catch {
      for (const id of staleIds) settingAside.delete(id);
      return readOnly('storage-failed');
    }
    // Every tap of this device's the server lacks is waiting in the queue: the game shown
    // is rebuilt from it, so what will be sent is what is shown (one hidden when the game
    // was lost, say, then kept on opening again into it), on top of those the server took
    // that the base lacks: the kept scoring never drops a tap its kept state does not
    // have (T-329). Scoring from the kept state, taps go on being made meanwhile, so it is
    // rebuilt in the lock taps run in, from the storage read again (T-331, step 2.61 seeds
    // 2024 and 5): a tap stored but not yet laid on the game finishes first and is counted
    // once, never by both; a tap made since under the ended session is judged like the
    // rest (`hold` again), never left unsent; and from here on taps are made under `held`.
    const rebuilt = await serially(async (): Promise<'rebuilt' | 'judge-again' | 'failed'> => {
      let list: readonly QueuedCommand[];
      try {
        list = await storage.list(gameId);
      } catch {
        return 'failed';
      }
      const waiting = list.filter((entry) => entry.state === 'waiting');
      if (waiting.some((entry) => !madeUnder(entry))) return 'judge-again';
      // Shown taps the storage no longer holds were taken by the server (sent from the
      // kept scoring before opening was answered, say): saved, so still counted until a
      // loaded state has them, though the base is older (T-329, step 2.61 seed 66).
      const storedNow = new Set(list.map((entry) => entry.command.commandId));
      const inBase = new Set((base?.state.recent ?? []).map((id) => id.toLowerCase()));
      const taken = made.filter(
        (c) =>
          !storedNow.has(c.commandId) &&
          !refusedIds.has(c.commandId) &&
          !inBase.has(c.commandId.toLowerCase()),
      );
      made = [...taken, ...waiting.map((entry) => entry.command)];
      sessionId = held;
      // Shown and kept as rebuilt now, in the lock (step 2.242): a tap set aside is never
      // shown, nor kept on top under the ended session, while the load below is unanswered.
      if (base === null) keepScoringNow();
      else showGame();
      return 'rebuilt';
    });
    if (rebuilt !== 'rebuilt') {
      for (const id of staleIds) settingAside.delete(id);
      return rebuilt === 'failed' ? readOnly('storage-failed') : hold(held);
    }
    // Listed as not saved: what was listed before, what the storage holds as not saved,
    // and the stale taps. A tap still to be sent is never listed (one listed when its
    // setting aside failed, then sent on opening again into the session it was made under).
    const sent = new Set(made.map((c) => c.commandId));
    const listed = withTaps(withTaps(current.notSaved, setAside), stale);
    listNotSaved(withoutTaps(listed, sent));
    // Listed because whose the commands since were could not be told (T-357): said so.
    if (couldNotTell && current.notSaved.length > 0) {
      update({ cannotTell: true });
    }
    couldNotTell = false;
    for (const id of staleIds) settingAside.delete(id);
    // Loading the state then drops any of them the server has after all (M1).
    return scoreWith(held);
  };

  /** Opens the game: asks for the session, and scores if it is given. */
  const open = async (): Promise<void> => {
    opening += 1;
    try {
      await openOnce();
    } finally {
      opening -= 1;
    }
  };

  const openOnce = async (): Promise<void> => {
    couldNotTell = false;
    // Scoring from what the device kept (step 2.38) carries on while opening is asked again.
    if (!(fromDevice && current.mode.kind === 'scoring')) update({ mode: { kind: 'opening' } });
    const opened = await session({ type: 'open', deviceId });
    if (opened.kind === 'unanswered') {
      await startFromDevice();
      return later(open);
    }
    failures = 0;
    if (opened.kind === 'rejected') return readOnly(reasonOfStatus(opened));
    const reply = opened.value;
    if (reply.status !== 'held-by-you') return notHeld(reply);
    return hold(reply.sessionId);
  };

  const renew = async (): Promise<void> => {
    const held = sessionId;
    if (held === null || stopped) return;
    const renewed = await session({ type: 'renew', sessionId: held });
    if (sessionId !== held) return;
    // Signed out: keep scoring, and keep renewing, which finds the sign-in again (M4).
    if (renewed.kind === 'rejected' && asksSignIn(renewed)) signedOutWhileScoring();
    if (renewed.kind === 'answer') {
      if (renewed.value.status !== 'held-by-you') {
        return held === keptSession ? settleByOpening() : notHeld(renewed.value);
      }
      signedInAgain();
    }
    scheduleRenew();
  };

  /** The queue stopped: find out why, and turn read-only unless it was a passing thing. */
  const onHalt = async (halt: QueueHalt): Promise<void> => {
    const reason = reasonOfHalt(halt);
    // Signed out (M4): the queue holds the taps; the renewal finds the sign-in again.
    if (reason === 'signed-out') return signedOutWhileScoring();
    if (reason !== 'check-session') return readOnly(reason);
    const held = sessionId;
    if (held === null) return;
    // Scoring under the session kept on the device, opening not answered yet: its end
    // is no loss yet, as the server may give this device a new one (step 2.38).
    if (held === keptSession) return settleByOpening();
    const renewed = await session({ type: 'renew', sessionId: held });
    if (sessionId !== held) return;
    if (renewed.kind === 'rejected' && asksSignIn(renewed)) {
      return signedOutWhileScoring();
    }
    if (renewed.kind !== 'answer') {
      return readOnly(renewed.kind === 'rejected' ? reasonOfStatus(renewed) : 'not-held');
    }
    const reply = renewed.value;
    if (reply.status !== 'held-by-you') return notHeld(reply);
    // The two answers disagree. Try once more; if the taps are still refused, stop.
    resumedAfterNotHeld += 1;
    if (resumedAfterNotHeld > 1) return readOnly('not-held');
    queue.resume();
  };

  /**
   * Drops the taps listed as not saved: the scorekeeper has seen them. `only`: just
   * these (a play entered again), the rest stay listed.
   */
  const forgetNotSaved = async (only?: readonly string[]): Promise<void> => {
    const shown = current.notSaved.filter(
      (t) => only === undefined || only.includes(t.command.commandId),
    );
    const ids = shown.map((t) => t.command.commandId);
    // Known as dismissed before the storage is written, so a read of it already under
    // way (a loss being listed, say) cannot bring them back (finding L3).
    for (const id of ids) dismissed.add(id);
    try {
      if (ids.length > 0) await queue.forget(ids);
    } catch (thrown) {
      // Still stored, so still listed, even if a listing meanwhile left them out: the
      // scorekeeper can dismiss them again.
      for (const id of ids) dismissed.delete(id);
      listNotSaved(withTaps(shown, current.notSaved));
      throw thrown;
    }
    const dropped = new Set(ids);
    made = made.filter((c) => !dropped.has(c.commandId));
    showNotSaved(withoutTaps(current.notSaved, dropped));
  };

  /** The queue's sequence when last seen, to tell when the server took a batch. */
  let seenSequence: number | null = null;

  /** A load under way because the server took a batch of a game not started. */
  let settling = false;
  /** The server took another batch while that load was under way. */
  let settleAgain = false;
  /** Asking for that load again, after one that got no answer. */
  let cancelSettle: (() => void) | null = null;
  let settleFailures = 0;

  /**
   * The server took a batch while the state this device works from has not started
   * (record 062): until then the server takes the game's rules as they stand at each
   * batch, so the state is loaded again and the game rebuilt on it, with the taps the
   * server does not have yet on top (`load`). A load that gets no answer is asked
   * again after a wait that grows, as opening does, on a timer of its own, so the
   * batch that started the game is followed by a load even if it was the last one.
   * Once the state has started, nothing happens here.
   */
  const settle = async (): Promise<void> => {
    settling = true;
    let unanswered = false;
    try {
      do {
        settleAgain = false;
        if (current.mode.kind !== 'scoring') return;
        if (!(await load())) {
          unanswered = true;
          break;
        }
        settleFailures = 0;
      } while (settleAgain && base?.state.status === 'scheduled');
    } finally {
      settling = false;
    }
    if (unanswered) settleLater();
  };

  const settleLater = (): void => {
    cancelSettle?.();
    cancelSettle = null;
    if (stopped || sessionId === null) return;
    settleFailures += 1;
    cancelSettle = clock.after(retryDelayMs(settleFailures, random(), retry), () => {
      cancelSettle = null;
      // Another load may have brought the game as started meanwhile: nothing to do then.
      if (base?.state.status !== 'scheduled') return;
      if (settling) settleAgain = true;
      else void track(settle());
    });
  };

  // --- Several minutes offline with plays waiting (T6 §4): said once, plainly. ---
  let offlineFrom: number | null = null;
  let cancelOfflineLong: (() => void) | null = null;
  /**
   * `offlineFrom` on the wall clock. The time is counted on both clocks and the longer
   * taken (the code review's M3): the steady clock stands still while some devices
   * sleep, so a phone woken after ten minutes asleep has waited ten minutes, not none.
   */
  let offlineFromWall: number | null = null;
  /** Says whether the plays have waited `offlineLongMs`, and looks again when they will have. */
  const judgeOffline = (): void => {
    cancelOfflineLong?.();
    cancelOfflineLong = null;
    const waited =
      offlineFrom === null || offlineFromWall === null
        ? null
        : Math.max(clock.now() - offlineFrom, wallClock() - offlineFromWall);
    const left = waited === null ? null : offlineLongMs - waited;
    if (left !== null && left <= 0) {
      if (!current.offlineLong) update({ offlineLong: true });
      return;
    }
    if (current.offlineLong) update({ offlineLong: false });
    if (left === null || stopped) return;
    cancelOfflineLong = clock.after(left, () => {
      cancelOfflineLong = null;
      if (!stopped) judgeOffline();
    });
  };
  const watchOffline = (status: QueueStatus): void => {
    const since = status.waiting > 0 ? status.unansweredSince : null;
    if (since === offlineFrom) return;
    offlineFrom = since;
    offlineFromWall = since === null ? null : wallClock() - (clock.now() - since);
    judgeOffline();
  };

  /** Loads the server's state again while scoring, trying later until it comes (T-113). */
  const loadAgain = async (): Promise<void> => {
    update({ reloading: true });
    const reload = async (): Promise<void> => {
      if (current.mode.kind !== 'scoring') return update({ reloading: false });
      if (!(await load())) return later(reload);
      failures = 0;
      update({ reloading: false });
    };
    await reload();
  };

  queue.subscribe((status, answer) => {
    watchOffline(status);
    // The time of the last save, on the server's clock (L1).
    const saved =
      status.savedAt !== null && status.savedAt !== seenSavedAt
        ? { lastSavedAt: onServerClock(status.savedAt) }
        : {};
    seenSavedAt = status.savedAt;
    update({ queue: status, notApplied: status.refused, waiting: status.waitingTaps, ...saved });
    let tookBatch = false;
    // Where the game stood before this answer, as this device knew it (T-338).
    const before = Math.max(seenSequence ?? 0, base?.sequence ?? 0);
    if (status.sequence !== null && status.sequence !== seenSequence) {
      seenSequence = status.sequence;
      tookBatch = true;
      // The server took taps from this session: a later "not held" is checked afresh.
      if (status.halted === null) resumedAfterNotHeld = 0;
    }
    const fresh = status.refused.filter((r) => !refusedIds.has(r.command.commandId));
    for (const r of fresh) refusedIds.add(r.command.commandId);
    if (fresh.length > 0 && base !== null && current.mode.kind === 'scoring') {
      // T-113: the server's record is the truth. Rebuild on it at once without the
      // refused taps, then on the state reloaded from the server.
      void serially(() => {
        made = made.filter((c) => !refusedIds.has(c.commandId));
        showGame();
      });
      void track(loadAgain());
    } else if (
      tookBatch &&
      base !== null &&
      base.state.status === 'scheduled' &&
      current.mode.kind === 'scoring'
    ) {
      if (settling) settleAgain = true;
      else void track(settle());
    } else if (
      answer !== undefined &&
      base !== null &&
      current.mode.kind === 'scoring' &&
      answer.sequence - before > answer.took
    ) {
      // The server's game moved by more than this answer's own taps since where this device
      // last knew it (T-338): plays sent by another scorekeeper's "Send these plays" while
      // this device held the game. Judged by what the server said it took for this batch,
      // never by the taps still waiting here. It is loaded again, as after a refusal, so
      // the next taps count on top of them and the screen never builds on a stale game.
      void track(loadAgain());
    }
    // The server has this device's End: the final game's look starts now (fix round B).
    if (cancelFinalCheck === null && !checkingFinal && endedHere()) scheduleFinalCheck();
    if (status.halted !== null && !checkingHalt && current.mode.kind === 'scoring') {
      checkingHalt = true;
      void track(onHalt(status.halted).finally(() => (checkingHalt = false)));
    }
  });

  /** The network is back: send now and renew the session. */
  const backOnline = (): void => {
    queue.wake();
    // Waiting to ask again: ask now.
    askAgainNow();
    if (sessionId !== null) void track(renew());
    // Players added on another device meanwhile (step 2.118).
    void refreshRosters();
    // Shown final: is it still? Asked now, not at the next look (T-295).
    if (looksFinal()) void track(checkFinal());
  };

  /** True once the queue has read what the device holds. */
  let begun = false;

  /** Reads what the device holds, then opens the game. */
  const begin = async (): Promise<void> => {
    try {
      await queue.start();
      // Taps a closed tab left waiting go out if the session they were made under is
      // still this device's (T-114, T-248); otherwise they are listed as not saved.
      const held = await storage.list(gameId);
      made = tapsIn(held, 'waiting');
      // Listed as not saved before the reload, and not dismissed: still listed, and
      // "Send these plays" still offered when the list kept what it was made on (T-337).
      restoreNotSavedSince(held);
      listNotSaved(withTaps(current.notSaved, keptIn(held, 'not-saved')));
    } catch {
      // Never left opening for good: read-only with a reason, and `openAgain` tries again.
      return readOnly('storage-failed');
    }
    begun = true;
    for (const r of queue.status().refused) refusedIds.add(r.command.commandId);
    return open();
  };

  // --- The doors: Reopen and Mark not started (step 2.37; game-doors.ts). ---

  /** A door is being gone through: no tap is taken until the device scores again. */
  let throughDoor = false;
  /** The reopen being asked for: its id is sent again with every retry (reopen-game.ts). */
  let reopening: { readonly requestId: string; readonly reason: string } | null = null;

  /** Sends what waits and says whether the server now has every tap of this device. */
  const nothingWaiting = async (): Promise<boolean> => {
    queue.wake();
    await queue.idle();
    return queue.status().waiting === 0;
  };

  /**
   * The number of the last tap this device knows the server has: the queue's, from the
   * latest batch it took, or the loaded state's when this device has sent nothing since.
   */
  const knownSequence = (): number => Math.max(queue.status().sequence ?? 0, base?.sequence ?? 0);

  /**
   * A door opened: the game is live again, or scheduled again, on the server, and the
   * session this device had ended with it. The session is taken again and the game
   * loaded, quietly: the mode shown stays what it is until the device scores, so the
   * screen is never swapped for "Opening the game…" and nothing says "game over".
   * Only if the server does not answer now does the device fall back to opening the
   * game as it does at the start, which keeps trying.
   */
  const carryOn = async (): Promise<void> => {
    stopScoring();
    const opened = await session({ type: 'open', deviceId });
    if (opened.kind === 'unanswered') {
      update({ mode: { kind: 'opening' } });
      return later(open);
    }
    failures = 0;
    if (opened.kind === 'rejected') return readOnly(reasonOfStatus(opened));
    const reply = opened.value;
    if (reply.status !== 'held-by-you') return notHeld(reply);
    return hold(reply.sessionId);
  };

  // --- A game shown final is asked about again (T-295, the review by use's H1). ---

  /**
   * Shows the game as over: read-only because the server has it decided. Another device
   * may reopen it and score, or end it again with another score, so the device asks.
   */
  const showsFinal = (): boolean =>
    current.mode.kind === 'read-only' && current.mode.reason === 'game-not-live';
  /**
   * This device ended the game and the server has every tap of it, End included, but
   * the device still scores until its hold check finds the game over (fix round B):
   * looked at like a game shown final, so a reopen elsewhere meanwhile is not missed.
   */
  const endedHere = (): boolean =>
    current.mode.kind === 'scoring' &&
    current.game?.status === 'final' &&
    !throughDoor &&
    queue.status().waiting === 0;
  const looksFinal = (): boolean => showsFinal() || endedHere();
  let cancelFinalCheck: (() => void) | null = null;
  let checkingFinal = false;

  /** The next look in `finalCheckMs`, while the game is shown final and the page is shown. */
  const scheduleFinalCheck = (): void => {
    cancelFinalCheck?.();
    cancelFinalCheck = null;
    if (stopped || pageHidden || !looksFinal()) return;
    cancelFinalCheck = clock.after(finalCheckMs, () => {
      cancelFinalCheck = null;
      void track(checkFinal());
    });
  };

  /**
   * Reads the game as the server has it (a plain read: no session is asked for, no row
   * is held). Still final: the score shown is the server's. Live again: the device does
   * what opening it does, so it shows who is scoring, as a device that does not hold
   * the game does. No answer: the screen stays and the next look asks again.
   */
  const checkFinal = async (): Promise<void> => {
    if (stopped || checkingFinal || !looksFinal()) return;
    checkingFinal = true;
    try {
      const loaded = await ask((signal) => server.loadState(signal));
      if (loaded.kind !== 'answer' || stopped || !looksFinal()) return;
      if (loaded.value.state.status === 'live') {
        await carryOn();
        return;
      }
      // Still scoring the game it ended: its own taps are shown until the hold check.
      if (!showsFinal()) return;
      if (base === null || loaded.value.sequence !== base.sequence) {
        base = loaded.value;
        made = [];
        showGame();
      }
    } finally {
      checkingFinal = false;
      scheduleFinalCheck();
    }
  };

  /** Goes through a door: one at a time, with no tap taken meanwhile. */
  const door = async <T>(
    work: (doors: GameDoors) => Promise<T>,
  ): Promise<T | { readonly ok: false; readonly reason: DoorProblem }> => {
    const { doors } = options;
    if (doors === undefined || stopped || throughDoor || current.game === null) {
      return { ok: false, reason: 'not-offered' };
    }
    throughDoor = true;
    try {
      // Every tap first: the door is judged on the game as the server has it. The check
      // runs in the one-at-a-time lock taps run in (the fix round's F4), so a tap already
      // being stored is stored, and counted, before it; taps after it are refused by
      // `throughDoor`. The work itself runs outside the lock: carrying on loads the game,
      // which takes the lock.
      if (!(await serially(nothingWaiting))) return { ok: false, reason: 'plays-waiting' };
      return await work(doors);
    } finally {
      throughDoor = false;
    }
  };

  /** What a door's outcome means when it is not the door's own answer. */
  const doorProblem = (outcome: Exclude<ServerOutcome<unknown>, { kind: 'answer' }>) =>
    ({
      ok: false,
      reason:
        outcome.kind === 'unanswered'
          ? 'unanswered'
          : asksSignIn(outcome)
            ? 'signed-out'
            : 'rejected',
    }) as const;

  /** A tap, recorded under `commandId` (a new ID, or a play entered again: `againCommandId`). */
  const tapWith = (input: TapInput, commandId: string): Promise<TapResult> =>
    serially(async (): Promise<TapResult> => {
      const game = current.game;
      if (current.mode.kind !== 'scoring' || game === null || base === null || throughDoor) {
        return { ok: false, reason: 'not-scoring' };
      }
      const command: TrackerCommand = { commandId, at: serverNow(), input };
      let next: basketball.GameState;
      try {
        next = basketball.apply(game, input, { id: command.commandId, now: command.at });
      } catch (thrown) {
        if (thrown instanceof basketball.TrackerError) {
          return { ok: false, reason: 'engine', message: thrown.message };
        }
        throw thrown;
      }
      const under = sessionId;
      // Where in the game it was made, kept beside it (finding I).
      const moment = momentIn(game, command.at);
      try {
        await queue.enqueue(command, moment);
      } catch (thrown) {
        const code = thrown instanceof QueueError ? thrown.code : 'storage-write-failed';
        return { ok: false, reason: 'storage', code };
      }
      // The game may have been lost while the tap was being stored: then it is not
      // shown but listed as not saved and set aside, so it is never lost silently.
      // (Read-only for a reason that keeps the waiting taps, it is kept like them.)
      // Read afresh: it may have changed while the tap was stored.
      const mode = modeNow();
      const keptLikeTheRest = mode.kind === 'read-only' && !losesTheGame(mode.reason, true);
      const isListed = () =>
        current.notSaved.some((t) => t.command.commandId === command.commandId);
      const moved = mode.kind !== 'scoring' || sessionId !== under;
      if (isListed() || (moved && !keptLikeTheRest)) {
        if (!isListed()) {
          // It may have gone out, and been taken, before the game was lost: wait for
          // that answer, and list it only if the storage still holds it waiting
          // (finding L1). If the storage cannot be read, it is listed: never lost silently.
          await queue.idle();
          const still = await storage.list(gameId).then(
            (list) => list.find((e) => e.command.commandId === command.commandId)?.state,
            () => 'waiting' as const,
          );
          // Taken by the server: saved. Shown on the game unless the server's state it
          // was rebuilt on already has it (the reload after the loss may have gone
          // unanswered): the game shown is never short of a saved play.
          if (still === undefined) {
            const id = command.commandId.toLowerCase();
            const inBase = base?.state.recent.some((r) => r.toLowerCase() === id) ?? false;
            if (!inBase && !made.some((c) => c.commandId === command.commandId)) {
              made.push(command);
              showGame();
            }
            return { ok: true, commandId: command.commandId };
          }
          if (still === 'waiting' && !isListed()) {
            listNotSaved(withTaps(current.notSaved, [{ command, moment }]));
          }
        }
        await putAside([command.commandId]).catch(() => undefined);
        return { ok: false, reason: 'not-scoring' };
      }
      made.push(command);
      update({ game: next });
      // Kept with every tap, not only on a load: a page reloaded with no signal before
      // the next load reopens on the kept state with this tap on top (step 2.38).
      keepScoringNow();
      return { ok: true, commandId: command.commandId };
    });

  /**
   * Changes of players (step 2.118), with the promises of `tapWith`: in the one-at-a-time
   * lock taps take, timed by the server's time, checked against the contract and the
   * rules before anything is stored, stored before they are listed, and on a loss while
   * they were stored listed as not saved and set aside, never lost silently.
   */
  const changeWith = (changes: readonly PlayerChange[]): Promise<PlayersResult> =>
    serially(async (): Promise<PlayersResult> => {
      const game = current.game;
      const shown = current.rosters;
      if (
        current.mode.kind !== 'scoring' ||
        game === null ||
        base === null ||
        throughDoor ||
        shown === null
      ) {
        return { ok: false, reason: 'not-scoring' };
      }
      const commands: TablePlayerCommand[] = [];
      let rosters = shown;
      for (const [index, change] of changes.entries()) {
        const input =
          change.type === 'add-player' ? { ...change, playerId: newPlayerId() } : change;
        const read = TablePlayerCommand.safeParse({
          commandId: newCommandId(),
          at: serverNow(),
          input,
        });
        if (!read.success) return { ok: false, reason: 'invalid', index };
        const problem = deviceProblem(rosters, read.data.input, game);
        if (problem !== null) return { ok: false, reason: 'rule', index, problem };
        rosters = withChanges(rosters, [read.data], gameId);
        commands.push(read.data);
      }
      const under = sessionId;
      const kept = commands.map((command) => ({ command, moment: momentIn(game, command.at) }));
      let stored = 0;
      for (const { command, moment } of kept) {
        try {
          await queue.enqueue(command, moment);
        } catch (thrown) {
          const code = thrown instanceof QueueError ? thrown.code : 'storage-write-failed';
          showRosters();
          return { ok: false, reason: 'storage', code, stored };
        }
        stored += 1;
      }
      const mode = modeNow();
      const keptLikeTheRest = mode.kind === 'read-only' && !losesTheGame(mode.reason, true);
      if ((mode.kind !== 'scoring' || sessionId !== under) && !keptLikeTheRest) {
        // Lost while they were stored: as for a tap, the answer to a batch already out
        // is waited for, and what is still waiting is listed and set aside.
        await queue.idle();
        const list = await storage.list(gameId).catch(() => null);
        const stateOf = (id: string) =>
          list === null ? 'waiting' : list.find((e) => e.command.commandId === id)?.state;
        const listed = new Set(current.notSaved.map((t) => t.command.commandId));
        const unsent = kept.filter(
          (k) => stateOf(k.command.commandId) === 'waiting' && !listed.has(k.command.commandId),
        );
        if (unsent.length > 0) listNotSaved(withTaps(current.notSaved, unsent));
        const aside = kept
          .map((k) => k.command.commandId)
          .filter((id) => stateOf(id) !== undefined);
        if (aside.length > 0) await putAside(aside).catch(() => undefined);
        showRosters();
        return { ok: false, reason: 'not-scoring' };
      }
      // On top of the base like a tap (the engine skips them), and kept with the scoring:
      // a reload that judges the taps of an ended session knows them as this device's own,
      // or its own add looks like somebody else's scoring (T-331, step 2.61 seed 5).
      made.push(...commands);
      keepScoringNow();
      showRosters();
      return {
        ok: true,
        commandIds: commands.map((c) => c.commandId),
        playerIds: commands.map((c) => c.input.playerId),
      };
    });

  const controller: TrackerController = {
    async start() {
      if (stopped) return;
      // The rosters are fetched on opening (step 2.118), beside the session and state.
      void refreshRosters();
      await track(begin());
      // The waiting changes the queue read are listed on the rosters at once.
      showRosters();
    },

    tap(input) {
      return tapWith(input, newCommandId());
    },

    changePlayers(changes) {
      return changeWith(changes);
    },

    async takeOver() {
      const mode = current.mode;
      if (mode.kind !== 'held-by-other') return { ok: false, reason: 'not-offered' };
      // Opening: what was shown about the lost game is no longer to be changed.
      update({ mode: { kind: 'opening' } });
      const taken = await track(
        session({
          type: 'take-over',
          deviceId,
          confirmed: true,
          expectedHolderSince: mode.holder.since,
        }),
      );
      if (taken.kind === 'unanswered') {
        // The other holder is shown again. What was being done about the lost game when
        // the takeover began (listing the taps, loading the server's state) stopped
        // then: it is done again, so the game shown is the server's.
        update({ mode });
        void track(lost());
        return { ok: false, reason: 'unanswered' };
      }
      // Turned away (signed out, may not score, say): read-only, and what was being done
      // about the lost game when the takeover began is finished, as when it goes
      // unanswered (finding L2): another device has had the game whatever the reason.
      if (taken.kind === 'rejected') {
        await track(readOnly(reasonOfStatus(taken), true));
        return { ok: true };
      }
      const reply = taken.value;
      if (reply.status !== 'held-by-you') {
        // Changed hands since it was shown: the new holder is shown to confirm again.
        await track(notHeld(reply, true));
        return { ok: true };
      }
      // What was made under the session that lost the game is never sent under this one.
      await track(hold(reply.sessionId));
      // The other device may have added players (step 2.118).
      void refreshRosters();
      return { ok: true };
    },

    async openAgain() {
      if (stopped) return;
      // Signed out while scoring: is the scorekeeper signed in again? (M4)
      if (current.signedOut && sessionId !== null) {
        await track(renew());
        return;
      }
      if (current.mode.kind !== 'read-only') return;
      await track(begun ? open() : begin());
    },

    online: backOnline,

    awake() {
      pageHidden = false;
      noticeSleep();
      // Plays may have waited long while the device slept (M3): counted on the wall clock.
      if (!stopped) judgeOffline();
      backOnline();
    },

    hidden() {
      pageHidden = true;
      cancelRenew?.();
      cancelRenew = null;
      cancelFinalCheck?.();
      cancelFinalCheck = null;
    },

    takeBackEnd() {
      return serially(async (): Promise<TakeBackEndResult> => {
        const end = [...made].reverse().find((c) => isTap(c) && c.input.type === 'end');
        if (end === undefined || current.game?.status !== 'final' || base === null) {
          return { ok: false, reason: 'not-waiting' };
        }
        let withdrawn: Withdrawn;
        try {
          withdrawn = await queue.withdraw([end.commandId]);
        } catch {
          return { ok: false, reason: 'storage' };
        }
        // Sent, and the answer lost: the server may have it. Kept, so the device never
        // shows a live game the server holds final; the next answer settles it.
        if (withdrawn.unsure.includes(end.commandId)) return { ok: false, reason: 'maybe-saved' };
        // Not held waiting any more: the server took it. The game is final there.
        if (!withdrawn.dropped.includes(end.commandId)) {
          return { ok: false, reason: 'already-saved' };
        }
        made = made.filter((c) => c.commandId !== end.commandId);
        // The End stopped the clock. Taken back, the clock stays stopped where the End
        // found it, as it does after a reopen (step 2.120): the scorekeeper starts it.
        const before = replay(base, made);
        if (basketball.clockAt(before, end.at).running) {
          const pause: TrackerCommand = {
            commandId: newCommandId(),
            at: end.at,
            input: { type: 'pause' },
          };
          try {
            await queue.enqueue(pause, momentIn(before, end.at));
            made.push(pause);
          } catch {
            // Not kept, so not shown: the game is live with its clock running on.
          }
        }
        showGame();
        return { ok: true };
      });
    },

    async reopenOffer() {
      const { doors } = options;
      if (doors === undefined || stopped) return null;
      const asked = await track(ask((signal) => doors.reopenOffer(signal)));
      return asked.kind === 'answer' ? asked.value : null;
    },

    reopen(reason) {
      return track(
        door<ReopenResult>(async (doors) => {
          const asking =
            reopening !== null && reopening.reason === reason
              ? reopening
              : { requestId: newCommandId(), reason };
          reopening = asking;
          const sequence = knownSequence();
          const asked = await ask((signal) =>
            doors.reopen({ ...asking, ...(sequence > 0 ? { sequence } : {}) }, signal),
          );
          // No answer: the same request goes again, and one the server took is answered
          // "reopened" again.
          if (asked.kind !== 'answer') return doorProblem(asked);
          reopening = null;
          const reply = asked.value;
          if (reply.status === 'refused') {
            // Live on the server already (reopened from elsewhere): carry on with it.
            if (reply.code !== 'game-not-decided') {
              // Moved on since this device looked: it reads the game again.
              if (reply.code === 'changed-since-read') void track(load());
              return {
                ok: false,
                reason: 'refused',
                code: reply.code,
                endedBy: reply.endedBy?.displayName ?? null,
              };
            }
          }
          await carryOn();
          // Another device holds it: the screen that says so says first it is open again.
          const mode = current.mode;
          if (mode.kind === 'held-by-other') update({ mode: { ...mode, reopened: true } });
          return { ok: true };
        }),
      );
    },

    async formatChanged() {
      if (!stopped && current.mode.kind === 'scoring') await track(load());
      // Changed on this device: its form has said so already (T-344).
      if (current.formatChangedTo !== null) update({ formatChangedTo: null });
    },

    async dismissFormatChanged() {
      if (current.formatChangedTo !== null) update({ formatChangedTo: null });
    },

    markNotStarted(reason) {
      return track(
        door<MarkNotStartedResult>(async (doors) => {
          const request = {
            sequence: knownSequence(),
            ...(reason === undefined ? {} : { reason }),
          };
          const asked = await ask((signal) => doors.markNotStarted(request, signal));
          if (asked.kind !== 'answer') return doorProblem(asked);
          const reply = asked.value;
          if (reply.status === 'refused') {
            if (reply.code === 'changed-since-read') void track(load());
            return { ok: false, reason: 'refused', code: reply.code };
          }
          await carryOn();
          return { ok: true };
        }),
      );
    },

    async dismissNotApplied(only) {
      const all = current.notApplied.map((r) => r.command.commandId);
      const ids = only === undefined ? all : all.filter((id) => only.includes(id));
      if (ids.length > 0) await track(queue.forget(ids));
    },

    async dismissNotSaved() {
      // Safe while scoring too: a tap listed as not saved is never one still to send.
      await track(forgetNotSaved());
    },

    async sendNotSaved() {
      const since = notSavedSince;
      const named = listSession ?? lastHeldSession;
      if (current.sendNotSaved !== 'offered' || since === null || named === null) {
        return { ok: false, reason: 'not-offered' };
      }
      update({ sendNotSaved: 'sending' });
      // In the order they were made, which is the server's for this device's plays (the
      // copy keeps it): the server looks past them batch by batch, in order (T-372, T-374).
      // Taps made in the same millisecond: by the server's recent ids, those it does not
      // name first (they are older), then as kept.
      const recent = new Map((base?.state.recent ?? []).map((id, i) => [id.toLowerCase(), i]));
      const plays = [...takenOfList, ...current.notSaved.map((t) => t.command)]
        .map((command, kept) => ({ command, kept }))
        .sort(
          (a, b) =>
            a.command.at - b.command.at ||
            (recent.get(a.command.commandId.toLowerCase()) ?? -1) -
              (recent.get(b.command.commandId.toLowerCase()) ?? -1) ||
            a.kept - b.kept,
        )
        .map((entry) => entry.command);
      const alreadyTaken = new Set(takenOfList.map((c) => c.commandId));
      const savedIds = new Set<string>();
      // A pass explains the game as far as its order allows and the server keeps that
      // (`sent`); one out of order ends a pass early, so a refused pass is sent again, at
      // most `sendPasses` times in all (T-374). Plays already there only answer duplicate.
      let moved = true;
      for (let pass = 0; pass < sendPasses && moved; pass += 1) {
        moved = false;
        for (let i = 0; i < plays.length; i += maxCommandsPerBatch) {
          const batch: CommandBatch = {
            protocolVersion: trackerProtocolVersion,
            sessionId: named,
            // Every batch names the same sequence: the server bounds it by where it last
            // answered the named session, and looks past this list's earlier batches (T-335).
            notSavedSince: since,
            knownRefusals: [...knownRefusals],
            commands: plays.slice(i, i + maxCommandsPerBatch),
          };
          const sent = await track(sendPlays(batch));
          if (sent.kind !== 'answer') {
            update({ sendNotSaved: 'offered' });
            return { ok: false, reason: sent.kind === 'unanswered' ? 'unanswered' : 'refused' };
          }
          const results = sent.value.results;
          const taken = results
            .filter((r) => r.status === 'accepted' || r.status === 'duplicate')
            .map((r) => r.commandId)
            .filter((id) => !alreadyTaken.has(id) && !savedIds.has(id));
          for (const id of taken) savedIds.add(id);
          // On the server now: off the list and out of the storage (if that fails they
          // stay listed, and sending them again only answers duplicates).
          if (taken.length > 0) await track(forgetNotSaved(taken)).catch(() => undefined);
          if (results.some((r) => r.status === 'refused' && r.reason.code === 'game-moved')) {
            moved = true;
          }
        }
      }
      if (moved) {
        if (current.notSaved.length > 0) update({ sendNotSaved: 'game-moved' });
        return { ok: false, reason: 'game-moved' };
      }
      const saved = savedIds.size;
      // Any the engine refused stay listed, to enter again; sending them again would not help.
      const gone = takenOfList.map((c) => c.commandId);
      [notSavedSince, takenOfList, listSession] = [null, [], null];
      if (gone.length > 0) await track(queue.forget(gone)).catch(() => undefined);
      update({ sendNotSaved: 'none' });
      void track(showServerGame());
      return { ok: true, saved };
    },

    async enterAgain(commandId) {
      // Only while this device holds the game (S-77): the league's record has one writer.
      if (current.mode.kind !== 'scoring') return { ok: false, reason: 'not-scoring' };
      const notSaved = current.notSaved.find((t) => t.command.commandId === commandId);
      const kept =
        notSaved?.command ??
        current.notApplied.find((r) => r.command.commandId === commandId)?.command;
      if (kept === undefined || !mayEnterAgain(kept.input)) {
        return { ok: false, reason: 'not-kept' };
      }
      // A new play, now, by the same path as a tap: the same checks, and Undo takes it back.
      // Its ID comes from the kept play's, so it is recorded once however often this is
      // tapped (review M1): one this device already holds, waiting or saved, is not
      // entered again, and the server answers a second copy as a duplicate.
      const againId = againCommandId(commandId);
      const held =
        made.some((c) => c.commandId === againId) ||
        (base?.state.recent ?? []).some((id) => id.toLowerCase() === againId);
      if (!held) {
        const tapped = await tapWith(kept.input, againId);
        if (!tapped.ok) return tapped;
      }
      try {
        await track(
          notSaved === undefined ? queue.forget([commandId]) : forgetNotSaved([commandId]),
        );
      } catch {
        // Entered, and still listed: the scorekeeper is told; tapping again only tries
        // to take it off the list once more.
        return { ok: false, reason: 'not-taken-off' };
      }
      return { ok: true, commandId: againId };
    },

    async leave() {
      stopped = true;
      clearTimer();
      cancelRenew?.();
      cancelRenew = null;
      cancelOfflineLong?.();
      cancelOfflineLong = null;
      cancelFinalCheck?.();
      cancelFinalCheck = null;
      const held = sessionId;
      sessionId = null;
      queue.stop();
      if (held !== null && queue.status().waiting === 0) {
        await track(session({ type: 'release', sessionId: held }));
      }
    },

    status: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async idle() {
      for (;;) {
        await queue.idle();
        if (underWay.size === 0) return;
        await Promise.allSettled([...underWay]);
      }
    },
  };
  return controller;
}
