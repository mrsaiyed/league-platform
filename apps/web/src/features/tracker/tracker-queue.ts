// The tracker's queue on the device (T6 §4; T-111, T-113, T-114, T-127). Every tap is
// stored before the screen confirms it, then sent in order, a batch at a time, and
// sent again until the server answers for it. A tap leaves the queue only when the
// server says accepted or duplicate. Because the queue lives in storage, closing the
// tab loses nothing: the next queue opened on the same storage carries on, and the
// server recognises anything it already had by its command ID.
//
// What each answer leaves behind:
// - accepted, duplicate: the tap is removed.
// - refused because of the game's rules (`rule`): kept as refused, never sent again,
//   until the tracker has told the scorekeeper and calls `forget` (T-113). The taps
//   after it are still sent: the server judges each one, as it does inside a batch.
// - refused for any other reason (the device lost the game, the game is not live, the
//   person may not score it): the same, and the queue then halts, because every later
//   tap would be refused too. The rest stay waiting until `resume` or `forget`.
// - the server does not speak the batch's protocol version, or turns the request away
//   whole (signed out, no such game): the queue halts with nothing changed.
// - no answer (no network, a timeout, a server error): nothing changes, and the queue
//   tries again after a wait that doubles up to half a minute (retry-delay.ts).
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
import type { CommandRefusal, QueueStorage, QueuedCommand } from './queue-storage.ts';
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
  /** The server turned the request away whole: signed out, not allowed, no such game. */
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
  /** The game's sequence number in the server's latest answer. */
  readonly sequence: number | null;
};

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
   * on screen only then (T-114). Rejects if it could not be stored.
   */
  enqueue(command: TrackerCommand): Promise<void>;
  /** Sends now instead of waiting: the network is back, or a scoring session was taken. */
  wake(): void;
  /** Clears a halt and sends again (after signing in again, or taking the game back). */
  resume(): void;
  /**
   * Drops taps for good: refused ones the scorekeeper has been told about, or waiting
   * ones after another device took over and they were shown as not saved (T6 §5).
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
    sequence: null,
  };
  const listeners = new Set<(status: QueueStatus) => void>();
  let started = false;
  let stopped = false;
  let failures = 0;
  let cancelRetry: (() => void) | null = null;
  let pumping: Promise<void> | null = null;
  let again = false;
  let readsStarted = 0;
  let readsShown = 0;

  const update = (change: Partial<QueueStatus>): void => {
    current = { ...current, ...change };
    for (const listener of listeners) listener(current);
  };

  /** Reads the queue and shows it. A read that finishes after a newer one is not shown. */
  const refresh = async (): Promise<readonly QueuedCommand[]> => {
    const ticket = ++readsStarted;
    const list = await storage.list(gameId);
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

  const retryLater = (): void => {
    failures += 1;
    update({ unansweredSince: current.unansweredSince ?? clock.now() });
    if (stopped) return;
    cancelRetry = clock.after(retryDelayMs(failures, random(), retry), () => {
      cancelRetry = null;
      kick();
    });
  };

  const nextBatch = (list: readonly QueuedCommand[], session: string): CommandBatch | null => {
    const waiting = list.filter((entry) => entry.state === 'waiting');
    const first = waiting[0];
    if (first === undefined) return null;
    // A batch carries one version: taps stored before a release go out as they were made.
    const commands: TrackerCommand[] = [];
    for (const entry of waiting) {
      if (entry.protocolVersion !== first.protocolVersion || commands.length === size) break;
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
        update({ halted: { kind: 'version-refused', accepted: outcome.refusal.accepted } });
        return false;
      case 'rejected':
        update({ halted: { kind: 'rejected', httpStatus: outcome.httpStatus } });
        return false;
      case 'reply':
        break;
    }
    // Answers are matched by command ID, not by place, and only for what was sent:
    // anything the reply leaves out stays waiting and goes again.
    const sent = new Set(batch.commands.map((command) => command.commandId));
    const remove: string[] = [];
    const refuse: { commandId: string; refusal: CommandRefusal }[] = [];
    let halt: QueueHalt | null = null;
    for (const result of outcome.reply.results) {
      if (!sent.delete(result.commandId)) continue;
      if (result.status !== 'refused') {
        remove.push(result.commandId);
        continue;
      }
      const { code, message } = result.reason;
      refuse.push({ commandId: result.commandId, refusal: { code, message } });
      if (code !== 'rule') halt ??= { kind: 'refused', code };
    }
    if (remove.length === 0 && refuse.length === 0) {
      // An answer about none of what was sent is no answer.
      retryLater();
      return false;
    }
    await storage.settle(gameId, { remove, refuse });
    failures = 0;
    update({
      unansweredSince: null,
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
      // The storage could not be read or written. What it holds is unchanged; try again.
      retryLater();
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
      if (stopped) throw new Error('The queue has stopped; the tap was not stored.');
      await storage.add(gameId, { protocolVersion, command });
      // Stored: whatever happens next, the tap is kept. A failed read only delays the count.
      await refresh().catch(() => undefined);
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
      await storage.settle(gameId, { remove: commandIds });
      await refresh();
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
