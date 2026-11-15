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
import {
  isTablePlayerCommand,
  sessionRenewSeconds,
  type BatchCommand,
  type SessionReply,
  type SessionRequest,
  type TrackerCommand,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import type { CommandTransport } from './command-transport.ts';
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
  /** Another device holds the game; `takeOver` after the scorekeeper confirms. */
  | {
      readonly kind: 'held-by-other';
      readonly holder: { readonly displayName: string; readonly since: number };
    }
  | { readonly kind: 'scoring' }
  | { readonly kind: 'read-only'; readonly reason: ReadOnlyReason };

export type TrackerControllerStatus = {
  readonly mode: ControllerMode;
  /** The game as this device shows it; null until it has loaded. */
  readonly game: basketball.GameState | null;
  /** The sequence number of the server's state the game was last rebuilt on. */
  readonly serverSequence: number | null;
  /** Taps the server refused, oldest first, until `dismissNotApplied` (T-113). */
  readonly notApplied: readonly RefusedCommand[];
  /**
   * Taps this device made that will not be sent: it no longer held the game (T6 §5).
   * Kept until `dismissNotSaved`, through a reload and further losses. Each carries the
   * period and game clock it was made at (finding I), so the screen can name it even
   * once the game shown has been rebuilt without it.
   */
  readonly notSaved: readonly KeptTap[];
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
};

export type TapResult =
  | { readonly ok: true; readonly commandId: string }
  /** The device is not scoring: opening, read-only, or another device holds the game. */
  | { readonly ok: false; readonly reason: 'not-scoring' }
  /** The engine said no (`message` is the engine's, for the log, not the screen). */
  | { readonly ok: false; readonly reason: 'engine'; readonly message: string }
  /** The tap could not be stored, so it is not shown (T-114). */
  | { readonly ok: false; readonly reason: 'storage'; readonly code: QueueErrorCode };

export type TakeOverResult =
  | { readonly ok: true }
  /** Not asked: the device is not being shown another holder. */
  | { readonly ok: false; readonly reason: 'not-offered' }
  /** No answer: try again when the network is back. */
  | { readonly ok: false; readonly reason: 'unanswered' };

export type TrackerControllerOptions = {
  readonly gameId: string;
  /** This device's own id, made once and kept on it (T-116). */
  readonly deviceId: string;
  readonly storage: QueueStorage;
  readonly transport: CommandTransport;
  readonly server: TrackerServer;
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
  readonly queue?: Pick<TrackerQueueOptions, 'batchSize' | 'retry' | 'sendTimeoutMs'>;
};

export type TrackerController = {
  /** Opens the game: the queue, the session, the server's state. */
  start(): Promise<void>;
  /** Applies a tap at once, stores it, and lets the queue send it (T-114). */
  tap(input: TapInput): Promise<TapResult>;
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
   * and what waits sent, as `online` does, so the time is measured again. The tracker
   * page wires it (step 2.38); this lane has no page.
   */
  awake(): void;
  /** The scorekeeper has seen the refused taps: they are dropped for good. */
  dismissNotApplied(): Promise<void>;
  /** The scorekeeper has seen the taps not saved: they are dropped for good. */
  dismissNotSaved(): Promise<void>;
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

const reasonOfStatus = (httpStatus: number): ReadOnlyReason => {
  if (httpStatus === 401) return 'signed-out';
  if (httpStatus === 403) return 'not-allowed';
  if (httpStatus === 404) return 'unknown-game';
  if (httpStatus === 409) return 'game-not-live';
  return 'request-refused';
};

const reasonOfHalt = (halt: QueueHalt): ReadOnlyReason | 'check-session' => {
  switch (halt.kind) {
    case 'refused':
      return halt.code === 'session-not-held' ? 'check-session' : halt.code;
    case 'version-refused':
      return 'update-needed';
    case 'rejected':
      return reasonOfStatus(halt.httpStatus);
  }
};

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

const losesTheGame = (reason: ReadOnlyReason, hadGame: boolean): boolean =>
  lostTheGame.has(reason) || (gameGone.has(reason) && hadGame);

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
    notApplied: [],
    notSaved: [],
    waiting: [],
    lastSavedAt: null,
    signedOut: false,
    reloading: false,
    queue: queue.status(),
    now: serverNow,
    clockErrorMs: null,
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

  const showGame = (): void => {
    if (base === null) return;
    update({ game: replay(base, made), serverSequence: base.sequence });
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

  const scheduleRenew = (): void => {
    cancelRenew?.();
    cancelRenew = null;
    if (stopped || sessionId === null) return;
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
    update({ notSaved: withoutTaps(list, dismissed) });
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
    update({ notSaved: withoutTaps(current.notSaved, new Set(saved)) });
    await queue.forget(saved).catch(() => undefined);
  };

  /**
   * The game was lost (T6 §5): what this device had not sent is listed as not saved,
   * added to what was listed before, and set aside in the storage so it is never sent
   * and a reload keeps the list. The server's state is shown, since another device may
   * be scoring it, or the game is over.
   */
  const lost = async (): Promise<void> => {
    // A batch already on its way may still be taken: wait for its answer, so a tap the
    // server took is not listed. Nothing more is sent, as the session is let go.
    await queue.idle();
    const held = await storage.list(gameId).catch(() => null);
    if (!stillLost()) return;
    if (held !== null) {
      const waiting = keptIn(held, 'waiting');
      const unsent = new Set(waiting.map((t) => t.command.commandId));
      made = made.filter((c) => !unsent.has(c.commandId));
      listNotSaved(withTaps(withTaps(current.notSaved, keptIn(held, 'not-saved')), waiting));
      // If this fails they are still listed, and never sent under another session.
      if (waiting.length > 0) await queue.setAside([...unsent]).catch(() => undefined);
      if (!stillLost()) return;
    }
    showGame();
    const loaded = await ask((signal) => server.loadState(signal));
    if (loaded.kind !== 'answer' || !stillLost()) return;
    await dropTaken(loaded.value);
    if (!stillLost()) return;
    base = loaded.value;
    made = [];
    showGame();
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
        update({ mode: { kind: 'held-by-other', holder: reply.holder } });
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
        return readOnly(reply.code, gameWasLost);
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
      if (loaded.httpStatus === 401 && current.mode.kind === 'scoring') {
        // Still scoring (M4): asked again later, and at once on signing in again.
        signedOutWhileScoring();
        return false;
      }
      await readOnly(reasonOfStatus(loaded.httpStatus));
      return true;
    }
    await serially(() => {
      const taken = new Set(loaded.value.state.recent.map((id) => id.toLowerCase()));
      made = made.filter(
        (c) =>
          !taken.has(c.commandId.toLowerCase()) &&
          !refusedIds.has(c.commandId) &&
          (!madeBefore.has(c.commandId) || waiting === null || waiting.has(c.commandId)),
      );
      base = loaded.value;
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
    let waiting: QueuedCommand[];
    let stale: KeptTap[];
    let setAside: KeptTap[];
    try {
      const list = await storage.list(gameId);
      waiting = list.filter((entry) => entry.state === 'waiting');
      setAside = keptIn(list, 'not-saved');
      stale = waiting.filter((entry) => !madeUnder(entry)).map(keptTap);
      if (stale.length > 0) await queue.setAside(stale.map((t) => t.command.commandId));
    } catch {
      // Not known to be dropped, so nothing may be sent: the session is not used, and
      // its lease runs out unless opening again (into the same session) gets this far.
      return readOnly('storage-failed');
    }
    // Not scoring, so every tap of this device's the server lacks is waiting in the
    // queue: the game shown is rebuilt from it, so what will be sent is what is shown
    // (one hidden when the game was lost, say, then kept on opening again into it).
    made = waiting.filter(madeUnder).map((entry) => entry.command);
    // Listed as not saved: what was listed before, what the storage holds as not saved,
    // and the stale taps. A tap still to be sent is never listed (one listed when its
    // setting aside failed, then sent on opening again into the session it was made under).
    const sent = new Set(made.map((c) => c.commandId));
    const listed = withTaps(withTaps(current.notSaved, setAside), stale);
    listNotSaved(withoutTaps(listed, sent));
    // Loading the state then drops any of them the server has after all (M1).
    return scoreWith(held);
  };

  /** Opens the game: asks for the session, and scores if it is given. */
  const open = async (): Promise<void> => {
    update({ mode: { kind: 'opening' } });
    const opened = await session({ type: 'open', deviceId });
    if (opened.kind === 'unanswered') return later(open);
    failures = 0;
    if (opened.kind === 'rejected') return readOnly(reasonOfStatus(opened.httpStatus));
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
    if (renewed.kind === 'rejected' && renewed.httpStatus === 401) signedOutWhileScoring();
    if (renewed.kind === 'answer') {
      if (renewed.value.status !== 'held-by-you') return notHeld(renewed.value);
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
    const renewed = await session({ type: 'renew', sessionId: held });
    if (sessionId !== held) return;
    if (renewed.kind === 'rejected' && renewed.httpStatus === 401) {
      return signedOutWhileScoring();
    }
    if (renewed.kind !== 'answer') {
      return readOnly(
        renewed.kind === 'rejected' ? reasonOfStatus(renewed.httpStatus) : 'not-held',
      );
    }
    const reply = renewed.value;
    if (reply.status !== 'held-by-you') return notHeld(reply);
    // The two answers disagree. Try once more; if the taps are still refused, stop.
    resumedAfterNotHeld += 1;
    if (resumedAfterNotHeld > 1) return readOnly('not-held');
    queue.resume();
  };

  /** Drops the taps listed as not saved: the scorekeeper has seen them. */
  const forgetNotSaved = async (): Promise<void> => {
    const shown = current.notSaved;
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
    update({ notSaved: withoutTaps(current.notSaved, dropped) });
  };

  /** The queue's sequence when last seen, to tell when the server took a batch. */
  let seenSequence: number | null = null;

  queue.subscribe((status) => {
    // The time of the last save, on the server's clock (L1).
    const saved =
      status.savedAt !== null && status.savedAt !== seenSavedAt
        ? { lastSavedAt: onServerClock(status.savedAt) }
        : {};
    seenSavedAt = status.savedAt;
    update({ queue: status, notApplied: status.refused, waiting: status.waitingTaps, ...saved });
    if (status.sequence !== null && status.sequence !== seenSequence) {
      seenSequence = status.sequence;
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
      update({ reloading: true });
      const reload = async (): Promise<void> => {
        if (current.mode.kind !== 'scoring') return update({ reloading: false });
        if (!(await load())) return later(reload);
        failures = 0;
        update({ reloading: false });
      };
      void track(reload());
    }
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
      // Listed as not saved before the reload, and not dismissed: still listed.
      listNotSaved(withTaps(current.notSaved, keptIn(held, 'not-saved')));
    } catch {
      // Never left opening for good: read-only with a reason, and `openAgain` tries again.
      return readOnly('storage-failed');
    }
    begun = true;
    for (const r of queue.status().refused) refusedIds.add(r.command.commandId);
    return open();
  };

  return {
    async start() {
      if (stopped) return;
      await track(begin());
    },

    tap(input) {
      return serially(async (): Promise<TapResult> => {
        const game = current.game;
        if (current.mode.kind !== 'scoring' || game === null || base === null) {
          return { ok: false, reason: 'not-scoring' };
        }
        const command: TrackerCommand = { commandId: newCommandId(), at: serverNow(), input };
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
          await queue.setAside([command.commandId]).catch(() => undefined);
          return { ok: false, reason: 'not-scoring' };
        }
        made.push(command);
        update({ game: next });
        return { ok: true, commandId: command.commandId };
      });
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
        await track(readOnly(reasonOfStatus(taken.httpStatus), true));
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
      noticeSleep();
      backOnline();
    },

    async dismissNotApplied() {
      const ids = current.notApplied.map((r) => r.command.commandId);
      if (ids.length > 0) await track(queue.forget(ids));
    },

    async dismissNotSaved() {
      // Safe while scoring too: a tap listed as not saved is never one still to send.
      await track(forgetNotSaved());
    },

    async leave() {
      stopped = true;
      clearTimer();
      cancelRenew?.();
      cancelRenew = null;
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
}
