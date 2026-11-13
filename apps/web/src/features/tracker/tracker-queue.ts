// The tracker's queue on the device (T6 §4; T-111, T-113, T-114, T-127). Every tap is
// stored before the screen confirms it, then sent in order, a batch at a time, and
// sent again until the server answers for it. A tap leaves the queue only when the
// server says accepted or duplicate. Because the queue lives in storage, closing the
// tab loses nothing: the next queue opened on the same storage carries on, and the
// server recognises anything it already had by its command ID.
//
// What each answer leaves behind (record 024):
// - accepted, duplicate: the tap is removed.
// - refused because of the game's rules (`rule`): kept as refused, never sent again,
//   until the tracker has told the scorekeeper and calls `forget` (T-113). The taps
//   after it are still sent: the server judges each one, as it does inside a batch.
// - refused for a reason about the request, not the tap (the device lost the game, the
//   game is not live, the person may not score it, no such game): the tap stays
//   waiting and the queue halts, because every later tap would be refused too. After
//   `resume` the waiting taps go out in order, none skipped; `forget` drops them.
// - the server could not take the batch as sent (400, 413, 422): the queue sends the
//   batch's taps one at a time; the one still turned away is kept as refused (`rule`),
//   and the rest go on.
// - the server does not speak the batch's protocol version, or turns the request away
//   whole (signed out, not allowed, no such game): the queue halts with nothing changed.
// - no answer (no network, a timeout, a server error): nothing changes, and the queue
//   tries again after a wait that doubles up to half a minute (retry-delay.ts).
// - the device's storage fails: nothing is lost that was stored; `storageFailure` says
//   so (never `unansweredSince`: it is not the network), and the queue tries again.
//
// It holds no screen and no words: step 2.37's banner reads `status()` (queue-banner.ts).
import {
  maxCommandsPerBatch,
  trackerProtocolVersion,
  type CommandBatch,
  type RefusalCode,
  type TrackerCommand,
} from '@srleagues/contracts';
import type { CommandTransport, TransportOutcome } from './command-transport.ts';
import {
  QueueError,
  type CommandRefusal,
  type QueueErrorCode,
  type QueueStorage,
  type QueuedCommand,
} from './queue-storage.ts';
import { defaultRetryTiming, retryDelayMs, type RetryTiming } from './retry-delay.ts';

/** Time as the queue sees it, so tests can move it on by hand. */
export type QueueClock = {
  /** Milliseconds, as Date.now(). */
  readonly now: () => number;
  /** Runs `run` once after `ms`; the function returned cancels it. */
  readonly after: (ms: number, run: () => void) => () => void;
};

export const browserClock: QueueClock = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/** Why the queue has stopped sending until `resume`. */
export type QueueHalt =
  /** A command was refused for a reason every later one shares (T-113, T-116). */
  | { readonly kind: 'refused'; readonly code: Exclude<RefusalCode, 'rule'> }
  /** The server no longer speaks the version these taps were made under (T-127). */
  | { readonly kind: 'version-refused'; readonly accepted: readonly number[] }
  /** The server turned the request away whole: signed out (401), not allowed (403), no such game (404). */
  | { readonly kind: 'rejected'; readonly httpStatus: number };

export type RefusedCommand = {
  readonly command: TrackerCommand;
  readonly refusal: CommandRefusal;
};

export type QueueStatus = {
  /** Taps stored and not yet answered for, including any being sent now. */
  readonly waiting: number;
  /** Taps the server refused, oldest first, until `forget` drops them. */
  readonly refused: readonly RefusedCommand[];
  /** True while the queue is sending or about to. */
  readonly sending: boolean;
  readonly halted: QueueHalt | null;
  /**
   * When sends began going unanswered (clock milliseconds); null once the server
   * answers. Lets the tracker warn after several minutes offline (T6 §4).
   */
  readonly unansweredSince: number | null;
  /**
   * Set while the device's storage fails to keep or read taps (clock milliseconds it
   * began, and a fixed code); null once it works again. Separate from
   * `unansweredSince`, so a storage failure is never shown as being offline.
   */
  readonly storageFailure: StorageFailure | null;
  /** The game's sequence number in the server's latest answer. */
  readonly sequence: number | null;
};

export type StorageFailure = { readonly code: QueueErrorCode; readonly since: number };

export type TrackerQueueOptions = {
  readonly gameId: string;
  readonly storage: QueueStorage;
  readonly transport: CommandTransport;
  readonly clock?: QueueClock;
  /** The scoring session this device holds (T-116); null while it holds none, and nothing is sent. */
  readonly sessionId: () => string | null;
  /** The version new taps are stored under; taps already stored keep theirs (T-127). */
  readonly protocolVersion?: number;
  /** The most taps in one batch. */
  readonly batchSize?: number;
  readonly retry?: RetryTiming;
  /** A send with no answer after this long counts as unanswered. */
  readonly sendTimeoutMs?: number;
  /** A number from 0 to 1, for spreading the waits. */
  readonly random?: () => number;
};

export type TrackerQueue = {
  /** Reads what the device already holds for the game, and starts sending it. */
  start(): Promise<void>;
  /**
   * Stores a tap at the end of the queue. Resolves once it is stored: confirm the tap
   * on screen only then (T-114). Rejects if it could not be stored, or if its command
   * ID is already held for another game (`command-id-in-other-game`).
   */
  enqueue(command: TrackerCommand): Promise<void>;
  /** Sends now instead of waiting: the network is back, or a scoring session was taken. */
  wake(): void;
  /**
   * Clears a halt and sends again (after signing in again, or taking the game back).
   * Taps left waiting by the halt go out first, in order.
   */
  resume(): void;
  /**
   * Drops taps for good: refused ones the scorekeeper has been told about, or waiting
   * ones after another device took over and they were shown as not saved (T6 §5).
   * A halt is cleared once no waiting tap is left for it to hold back.
   */
  forget(commandIds: readonly string[]): Promise<void>;
  status(): QueueStatus;
  /** Called with the new status after every change. Returns the unsubscribe. */
  subscribe(listener: (status: QueueStatus) => void): () => void;
  /** Stops sending: the page is leaving the game. What is stored stays stored. */
  stop(): void;
  /** Resolves when the queue is not in the middle of sending. For tests. */
  idle(): Promise<void>;
};

const unanswered: TransportOutcome = { kind: 'unanswered' };

type RefusedEntry = { readonly commandId: string; readonly refusal: CommandRefusal };

export function createTrackerQueue(options: TrackerQueueOptions): TrackerQueue {
  const {
    gameId,
    storage,
    transport,
    sessionId,
    clock = browserClock,
    protocolVersion = trackerProtocolVersion,
    batchSize = maxCommandsPerBatch,
    retry = defaultRetryTiming,
    sendTimeoutMs = 15_000,
    random = Math.random,
  } = options;
  const size = Math.min(Math.max(Math.trunc(batchSize), 1), maxCommandsPerBatch);

  let current: QueueStatus = {
    waiting: 0,
    refused: [],
    sending: false,
    halted: null,
    unansweredSince: null,
    storageFailure: null,
    sequence: null,
  };
  const listeners = new Set<(status: QueueStatus) => void>();
  let started = false;
  let stopped = false;
  let failures = 0;
  let storageFailures = 0;
  /** After a batch the server could not take, how many taps still go out one at a time. */
  let singlesLeft = 0;
  let cancelRetry: (() => void) | null = null;
  let pumping: Promise<void> | null = null;
  let again = false;
  let readsStarted = 0;
  let readsShown = 0;

  const update = (change: Partial<QueueStatus>): void => {
    current = { ...current, ...change };
    for (const listener of listeners) listener(current);
  };

  /** Runs one storage call, keeping `storageFailure` true to how the last one went. */
  const stored = async <T>(fallback: QueueErrorCode, run: () => Promise<T>): Promise<T> => {
    let value: T;
    try {
      value = await run();
    } catch (error) {
      // A command ID held for another game is the caller's mistake, not the storage's.
      const code = error instanceof QueueError ? error.code : fallback;
      if (code !== 'command-id-in-other-game') {
        update({ storageFailure: { code, since: current.storageFailure?.since ?? clock.now() } });
      }
      throw error;
    }
    storageFailures = 0;
    if (current.storageFailure !== null) update({ storageFailure: null });
    return value;
  };

  /** Reads the queue and shows it. A read that finishes after a newer one is not shown. */
  const refresh = async (): Promise<readonly QueuedCommand[]> => {
    const ticket = ++readsStarted;
    const list = await stored('storage-read-failed', () => storage.list(gameId));
    if (ticket > readsShown) {
      readsShown = ticket;
      update({
        waiting: list.filter((entry) => entry.state === 'waiting').length,
        refused: list.flatMap((entry) =>
          entry.state === 'refused' ? [{ command: entry.command, refusal: entry.refusal }] : [],
        ),
      });
    }
    return list;
  };

  const kick = (): void => {
    if (!started || stopped || current.halted !== null || cancelRetry !== null) return;
    if (pumping !== null) {
      again = true;
      return;
    }
    pumping = pump().finally(() => {
      pumping = null;
      if (again) {
        again = false;
        kick();
      }
    });
  };

  const tryAgainAfter = (attempt: number): void => {
    if (stopped) return;
    cancelRetry = clock.after(retryDelayMs(attempt, random(), retry), () => {
      cancelRetry = null;
      kick();
    });
  };

  /** The server did not answer. */
  const retryLater = (): void => {
    failures += 1;
    update({ unansweredSince: current.unansweredSince ?? clock.now() });
    tryAgainAfter(failures);
  };

  /** The server answered: whatever it said, the device is not offline. */
  const answered = (change: Partial<QueueStatus> = {}): void => {
    failures = 0;
    update({ unansweredSince: null, ...change });
  };

  const settle = (remove: readonly string[], refuse: readonly RefusedEntry[]): Promise<void> =>
    stored('storage-write-failed', () => storage.settle(gameId, { remove, refuse }));

  const nextBatch = (list: readonly QueuedCommand[], session: string): CommandBatch | null => {
    const waiting = list.filter((entry) => entry.state === 'waiting');
    const first = waiting[0];
    if (first === undefined) return null;
    // A batch carries one version: taps stored before a release go out as they were made.
    const most = singlesLeft > 0 ? 1 : size;
    const commands: TrackerCommand[] = [];
    for (const entry of waiting) {
      if (entry.protocolVersion !== first.protocolVersion || commands.length === most) break;
      commands.push(entry.command);
    }
    return { protocolVersion: first.protocolVersion, sessionId: session, commands };
  };

  const send = async (batch: CommandBatch): Promise<TransportOutcome> => {
    const abort = new AbortController();
    let cancelTimeout = (): void => undefined;
    const timedOut = new Promise<TransportOutcome>((resolve) => {
      cancelTimeout = clock.after(sendTimeoutMs, () => {
        abort.abort();
        resolve(unanswered);
      });
    });
    try {
      const answered = transport.send(batch, abort.signal).catch(() => unanswered);
      return await Promise.race([answered, timedOut]);
    } finally {
      cancelTimeout();
    }
  };

  /** Applies one outcome. True when the queue should go straight on to the next batch. */
  const apply = async (batch: CommandBatch, outcome: TransportOutcome): Promise<boolean> => {
    switch (outcome.kind) {
      case 'unanswered':
        retryLater();
        return false;
      case 'version-refused':
        answered({ halted: { kind: 'version-refused', accepted: outcome.refusal.accepted } });
        return false;
      case 'rejected':
        answered({ halted: { kind: 'rejected', httpStatus: outcome.httpStatus } });
        return false;
      case 'batch-refused': {
        const [only, ...rest] = batch.commands;
        if (only === undefined) return false;
        answered();
        if (rest.length > 0) {
          // One of these taps is bad, or there are too many: send them one at a time.
          singlesLeft = Math.max(singlesLeft, batch.commands.length);
          return true;
        }
        // This one tap the server cannot take as sent: refused, as a game rule would
        // be, so the scorekeeper is told and the rest go on (record 024).
        const refusal: CommandRefusal = { code: 'rule', message: `http-${outcome.httpStatus}` };
        await settle([], [{ commandId: only.commandId, refusal }]);
        singlesLeft = Math.max(singlesLeft - 1, 0);
        await refresh();
        return true;
      }
      case 'reply':
        break;
    }
    // Answers are matched by command ID, not by place, and only for what was sent:
    // anything the reply leaves out stays waiting and goes again.
    const sent = new Set(batch.commands.map((command) => command.commandId));
    const remove: string[] = [];
    const refuse: RefusedEntry[] = [];
    let halt: QueueHalt | null = null;
    for (const result of outcome.reply.results) {
      if (!sent.delete(result.commandId)) continue;
      if (result.status !== 'refused') {
        remove.push(result.commandId);
        continue;
      }
      const { code, message } = result.reason;
      // Only a game rule is about the tap. Any other reason is about the request (the
      // session, the game, the person): the tap stays waiting for `resume`.
      if (code === 'rule') refuse.push({ commandId: result.commandId, refusal: { code, message } });
      else halt ??= { kind: 'refused', code };
    }
    if (remove.length === 0 && refuse.length === 0 && halt === null) {
      // An answer about none of what was sent is no answer.
      retryLater();
      return false;
    }
    if (remove.length > 0 || refuse.length > 0) await settle(remove, refuse);
    if (singlesLeft > 0) singlesLeft = Math.max(singlesLeft - batch.commands.length, 0);
    answered({
      sequence: Math.max(current.sequence ?? 0, outcome.reply.sequence),
      ...(halt === null ? {} : { halted: halt }),
    });
    await refresh();
    return halt === null;
  };

  const pump = async (): Promise<void> => {
    update({ sending: true });
    try {
      for (;;) {
        again = false;
        if (stopped || current.halted !== null) return;
        const session = sessionId();
        if (session === null) return;
        const batch = nextBatch(await refresh(), session);
        if (batch === null) {
          failures = 0;
          if (current.unansweredSince !== null) update({ unansweredSince: null });
          return;
        }
        if (!(await apply(batch, await send(batch)))) return;
      }
    } catch {
      // The storage could not be read or written (`storageFailure` says so). What it
      // holds is unchanged; try again, without calling it the network.
      storageFailures += 1;
      tryAgainAfter(storageFailures);
    } finally {
      update({ sending: false });
    }
  };

  return {
    async start() {
      if (started || stopped) return;
      await refresh();
      started = true;
      kick();
    },

    async enqueue(command) {
      if (stopped) throw new QueueError('queue-stopped');
      const added = await stored('storage-write-failed', () =>
        storage.add(gameId, { protocolVersion, command }),
      );
      // Stored: whatever happens next, the tap is kept. If the read after it fails, the
      // count goes up by hand, so the screen never shows fewer waiting than are held.
      const shown = readsShown;
      try {
        await refresh();
      } catch {
        if (added === 'added' && readsShown === shown) update({ waiting: current.waiting + 1 });
      }
      kick();
    },

    wake() {
      cancelRetry?.();
      cancelRetry = null;
      kick();
    },

    resume() {
      if (current.halted !== null) update({ halted: null });
      kick();
    },

    async forget(commandIds) {
      await settle(commandIds, []);
      const list = await refresh();
      // Nothing left for the halt to hold back: the queue is free again.
      if (current.halted !== null && !list.some((entry) => entry.state === 'waiting')) {
        update({ halted: null });
      }
      kick();
    },

    status: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    stop() {
      stopped = true;
      cancelRetry?.();
      cancelRetry = null;
    },

    async idle() {
      while (pumping !== null) await pumping;
    },
  };
}
