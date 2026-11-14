// The tracker's logic on the device, with no drawing (T6 §1, §3, §4, §5; T-113, T-114,
// T-116; record 041). The screens of steps 2.35 to 2.37 read `status()` and call the
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
//   because this session no longer holds the game), the device turns read-only, says
//   why, and lists the taps it had not sent as not saved (T6 §5). They are never sent
//   under another session: taking the game back drops them, as they were shown.
// - Offline nothing changes for the scorekeeper: taps are applied and stored, and the
//   queue sends them when the network is back (`online`).
import {
  sessionRenewSeconds,
  type SessionReply,
  type SessionRequest,
  type TrackerCommand,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import type { CommandTransport } from './command-transport.ts';
import { QueueError, type QueueErrorCode, type QueueStorage } from './queue-storage.ts';
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
  | 'unknown-game'
  /** Signed out: signing in again and `openAgain` carries on with the same taps. */
  | 'signed-out'
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
  /** Taps this device made that will not be sent: it no longer holds the game (T6 §5). */
  readonly notSaved: readonly TrackerCommand[];
  /** True while the server's state is being reloaded after a refusal. */
  readonly reloading: boolean;
  readonly queue: QueueStatus;
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
  readonly clock?: QueueClock;
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
  /** From read-only: asks for the game again (after signing in again, say). */
  openAgain(): Promise<void>;
  /** The network is back: send now and renew the session. */
  online(): void;
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

/** Whether a stored tap is one the device's engine applies (the rest are refused on the server). */
const isTapInput = (input: TrackerCommand['input']): input is TapInput =>
  input.type !== 'rules' && input.type !== 'reopen' && input.type !== 'reset';

const reasonOfStatus = (httpStatus: number): ReadOnlyReason => {
  if (httpStatus === 401) return 'signed-out';
  if (httpStatus === 403) return 'not-allowed';
  if (httpStatus === 409) return 'game-not-live';
  return 'unknown-game';
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
]);

const lowerUuid = (): string => globalThis.crypto.randomUUID().toLowerCase();

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
  } = options;

  let sessionId: string | null = null;
  /** The session this device held last, so opening again can tell whether it carries on. */
  let lastSessionId: string | null = null;
  /** Server time less device time, from the latest session reply (T-121, record 036). */
  let offsetMs = 0;
  let base: ServerState | null = null;
  /** This device's taps since `base`, in order: the ones the server took and the waiting. */
  let made: TrackerCommand[] = [];
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
    reloading: false,
    queue: queue.status(),
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

  const session = (request: SessionRequest) =>
    ask((signal) => server.session(request, signal)).then((outcome) => {
      if (outcome.kind === 'answer') offsetMs = outcome.value.sentAt - clock.now();
      return outcome;
    });

  const waitingTaps = async (): Promise<TrackerCommand[]> =>
    (await storage.list(gameId))
      .filter((entry) => entry.state === 'waiting')
      .map((entry) => entry.command);

  /** The base with every tap of `taps` the engine takes on it, in order. */
  const replay = (from: ServerState, taps: readonly TrackerCommand[]): basketball.GameState => {
    let state = from.state;
    for (const command of taps) {
      if (!isTapInput(command.input)) continue;
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

  /** No longer scoring: nothing more is sent, and what was waiting is listed as not saved. */
  const readOnly = async (reason: ReadOnlyReason): Promise<void> => {
    sessionId = null;
    cancelRenew?.();
    cancelRenew = null;
    clearTimer();
    const waiting = await waitingTaps().catch(() => current.notSaved);
    const unsent = new Set(waiting.map((c) => c.commandId));
    made = made.filter((c) => !unsent.has(c.commandId));
    update({ mode: { kind: 'read-only', reason }, notSaved: waiting });
    showGame();
    if (!lostTheGame.has(reason)) return;
    // Another device may be scoring it: show what the server holds now, if it answers.
    const loaded = await ask((signal) => server.loadState(signal));
    if (loaded.kind === 'answer' && current.mode.kind === 'read-only') {
      base = loaded.value;
      made = [];
      showGame();
    }
  };

  /** What a session reply that is not "held by you" means for this device. */
  const notHeld = async (reply: Exclude<SessionReply, { status: 'held-by-you' }>) => {
    switch (reply.status) {
      case 'held-by-other': {
        sessionId = null;
        cancelRenew?.();
        cancelRenew = null;
        const waiting = await waitingTaps().catch(() => current.notSaved);
        update({ mode: { kind: 'held-by-other', holder: reply.holder }, notSaved: waiting });
        return;
      }
      case 'ended':
        return readOnly(reply.reason);
      case 'refused':
        return readOnly(reply.code);
    }
  };

  /**
   * Loads the server's state and rebuilds the game on it. The taps kept on top are
   * those the state does not have: made after the load began, or still waiting when
   * it began (a tap the server took before then is in the state).
   */
  const load = async (): Promise<boolean> => {
    // If the storage cannot be read, every tap is kept unless the state has it.
    const waiting = await waitingTaps().then(
      (taps) => new Set(taps.map((c) => c.commandId)),
      () => null,
    );
    const madeBefore = made.length;
    const loaded = await ask((signal) => server.loadState(signal));
    if (loaded.kind === 'unanswered') return false;
    if (loaded.kind === 'rejected') {
      await readOnly(reasonOfStatus(loaded.httpStatus));
      return true;
    }
    await serially(() => {
      const taken = new Set(loaded.value.state.recent.map((id) => id.toLowerCase()));
      made = made.filter(
        (c, i) =>
          !taken.has(c.commandId.toLowerCase()) &&
          !refusedIds.has(c.commandId) &&
          (i >= madeBefore || waiting === null || waiting.has(c.commandId)),
      );
      base = loaded.value;
      showGame();
    });
    return true;
  };

  /** Holding the session: load the game and score. */
  const scoreWith = async (held: string): Promise<void> => {
    sessionId = held;
    lastSessionId = held;
    resumedAfterNotHeld = 0;
    scheduleRenew();
    const loading = async (): Promise<void> => {
      if (!(await load())) return later(loading);
      failures = 0;
      if (sessionId === null) return;
      update({ mode: { kind: 'scoring' }, notSaved: [] });
      queue.resume();
    };
    await loading();
  };

  /** Opens the game; `keep` says which session's waiting taps may still be sent. */
  const open = async (keep: (sessionId: string) => boolean): Promise<void> => {
    update({ mode: { kind: 'opening' } });
    const opened = await session({ type: 'open', deviceId });
    if (opened.kind === 'unanswered') return later(() => open(keep));
    failures = 0;
    if (opened.kind === 'rejected') return readOnly(reasonOfStatus(opened.httpStatus));
    const reply = opened.value;
    if (reply.status !== 'held-by-you') return notHeld(reply);
    if (!keep(reply.sessionId)) await forgetNotSaved();
    return scoreWith(reply.sessionId);
  };

  const renew = async (): Promise<void> => {
    const held = sessionId;
    if (held === null || stopped) return;
    const renewed = await session({ type: 'renew', sessionId: held });
    if (sessionId !== held) return;
    if (renewed.kind === 'rejected' && renewed.httpStatus === 401) return readOnly('signed-out');
    if (renewed.kind === 'answer' && renewed.value.status !== 'held-by-you') {
      return notHeld(renewed.value);
    }
    scheduleRenew();
  };

  /** The queue stopped: find out why, and turn read-only unless it was a passing thing. */
  const onHalt = async (halt: QueueHalt): Promise<void> => {
    const reason = reasonOfHalt(halt);
    if (reason !== 'check-session') return readOnly(reason);
    const held = sessionId;
    if (held === null) return;
    const renewed = await session({ type: 'renew', sessionId: held });
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

  /** Drops the taps that were listed as not saved: they are never sent under another session. */
  const forgetNotSaved = async (): Promise<void> => {
    const ids = (await waitingTaps()).map((c) => c.commandId);
    if (ids.length > 0) await queue.forget(ids);
    const dropped = new Set(ids);
    made = made.filter((c) => !dropped.has(c.commandId));
    update({ notSaved: [] });
  };

  queue.subscribe((status) => {
    update({ queue: status, notApplied: status.refused });
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

  return {
    async start() {
      if (stopped) return;
      await queue.start();
      // Taps a closed tab left waiting go out under this device's session (T-114).
      made = await waitingTaps();
      for (const r of queue.status().refused) refusedIds.add(r.command.commandId);
      await track(open(() => true));
    },

    tap(input) {
      return serially(async (): Promise<TapResult> => {
        const game = current.game;
        if (current.mode.kind !== 'scoring' || game === null || base === null) {
          return { ok: false, reason: 'not-scoring' };
        }
        const command: TrackerCommand = {
          commandId: newCommandId(),
          at: Math.max(0, Math.round(clock.now() + offsetMs)),
          input,
        };
        let next: basketball.GameState;
        try {
          next = basketball.apply(game, input, { id: command.commandId, now: command.at });
        } catch (thrown) {
          if (thrown instanceof basketball.TrackerError) {
            return { ok: false, reason: 'engine', message: thrown.message };
          }
          throw thrown;
        }
        try {
          await queue.enqueue(command);
        } catch (thrown) {
          const code = thrown instanceof QueueError ? thrown.code : 'storage-write-failed';
          return { ok: false, reason: 'storage', code };
        }
        made.push(command);
        update({ game: next });
        return { ok: true, commandId: command.commandId };
      });
    },

    async takeOver() {
      const mode = current.mode;
      if (mode.kind !== 'held-by-other') return { ok: false, reason: 'not-offered' };
      const taken = await track(
        session({
          type: 'take-over',
          deviceId,
          confirmed: true,
          expectedHolderSince: mode.holder.since,
        }),
      );
      if (taken.kind === 'unanswered') return { ok: false, reason: 'unanswered' };
      if (taken.kind === 'rejected') {
        await track(readOnly(reasonOfStatus(taken.httpStatus)));
        return { ok: true };
      }
      const reply = taken.value;
      if (reply.status !== 'held-by-you') {
        // Changed hands since it was shown: the new holder is shown to confirm again.
        await track(notHeld(reply));
        return { ok: true };
      }
      // Made under a session that lost the game, and listed as not saved: never sent.
      await track(forgetNotSaved());
      await track(scoreWith(reply.sessionId));
      return { ok: true };
    },

    async openAgain() {
      if (current.mode.kind !== 'read-only') return;
      const before = lastSessionId;
      await track(open((held) => held === before));
    },

    online() {
      queue.wake();
      const run = retrying;
      if (run !== null) {
        // Waiting to ask again: ask now.
        failures = 0;
        clearTimer();
        void track(run());
      }
      if (sessionId !== null) void track(renew());
    },

    async dismissNotApplied() {
      const ids = current.notApplied.map((r) => r.command.commandId);
      if (ids.length > 0) await track(queue.forget(ids));
    },

    async dismissNotSaved() {
      if (current.mode.kind === 'scoring') return;
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
