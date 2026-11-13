// Stand-ins for the queue's tests: a clock moved on by hand, and a server that keeps
// the commands it has saved, answers duplicate for one it already has, and can be
// down, slow, refusing, or saving a batch and never answering (the tab closed).
import type { CommandBatch, CommandResult, RefusalCode } from '@srleagues/contracts';
import type { CommandTransport, TransportOutcome } from './command-transport.ts';
import type { QueueClock } from './tracker-queue.ts';

/** Lets every promise already under way run to its end. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
};

export type ManualClock = QueueClock & {
  /** Moves time on, running each timer when its moment comes. */
  advance(ms: number): Promise<void>;
  /** Timers set and not yet run or cancelled. */
  pending(): number;
};

export function createManualClock(start = 1_700_000_000_000): ManualClock {
  let now = start;
  let order = 0;
  type Timer = { at: number; order: number; run: () => void; live: boolean };
  const timers: Timer[] = [];
  const live = () => timers.filter((t) => t.live);
  return {
    now: () => now,
    after(ms, run) {
      const timer = { at: now + Math.max(ms, 0), order: order++, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    pending: () => live().length,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        const due = live()
          .filter((t) => t.at <= end)
          .sort((a, b) => a.at - b.at || a.order - b.order)[0];
        if (due === undefined) break;
        now = due.at;
        due.live = false;
        due.run();
      }
      now = end;
      await flush();
    },
  };
}

export type ServerMode =
  /** Saves and answers. */
  | 'up'
  /** No answer at all: no network, or the server is down. */
  | 'down'
  /** Saves the batch, then the answer never arrives (the tab closed mid-send). */
  | 'save-and-vanish'
  /** Saves the batch and answers only after `slowMs` on the clock. */
  | 'slow';

export type FakeServer = {
  mode: ServerMode;
  /** How late a slow answer arrives. */
  slowMs: number;
  /** Command IDs to refuse, with the reason's code. */
  readonly refuse: Map<string, RefusalCode>;
  /**
   * Command IDs the server cannot take as sent, with the HTTP status: a batch holding
   * any of them is turned away whole (`batch-refused`).
   */
  readonly badRequest: Map<string, number>;
  /** When set, every batch is answered with this instead. */
  answerWith: TransportOutcome | null;
  /** Every command saved, once each, in the order saved. */
  readonly saved: string[];
  /** Every batch that reached the transport, whatever happened to it. */
  readonly received: CommandBatch[];
  /** The most sends that were ever under way at once. */
  readonly mostAtOnce: () => number;
  readonly transport: CommandTransport;
};

export function createFakeServer(clock: QueueClock): FakeServer {
  let underWay = 0;
  let most = 0;
  let sequence = 0;
  const saved: string[] = [];
  const received: CommandBatch[] = [];
  const refuse = new Map<string, RefusalCode>();
  const badRequest = new Map<string, number>();

  const save = (batch: CommandBatch): TransportOutcome => {
    const results = batch.commands.map((command): CommandResult => {
      const { commandId } = command;
      if (saved.includes(commandId)) return { commandId, status: 'duplicate' };
      const code = refuse.get(commandId);
      if (code !== undefined) {
        return { commandId, status: 'refused', reason: { code, message: `refused: ${code}` } };
      }
      saved.push(commandId);
      sequence += 1;
      return { commandId, status: 'accepted' };
    });
    return { kind: 'reply', reply: { protocolVersion: batch.protocolVersion, sequence, results } };
  };

  const server: FakeServer = {
    mode: 'up',
    slowMs: 0,
    refuse,
    badRequest,
    answerWith: null,
    saved,
    received,
    mostAtOnce: () => most,
    transport: {
      async send(batch, signal) {
        received.push(structuredClone(batch));
        underWay += 1;
        most = Math.max(most, underWay);
        try {
          if (server.answerWith !== null) return server.answerWith;
          const bad = batch.commands.find((c) => badRequest.has(c.commandId));
          if (bad !== undefined && server.mode !== 'down') {
            return { kind: 'batch-refused', httpStatus: badRequest.get(bad.commandId) ?? 400 };
          }
          switch (server.mode) {
            case 'down':
              return { kind: 'unanswered' };
            case 'save-and-vanish':
              save(batch);
              // Nothing comes back; like fetch, it ends only when the send is given up.
              return await new Promise<TransportOutcome>((resolve) => {
                signal.addEventListener('abort', () => resolve({ kind: 'unanswered' }));
              });
            case 'slow': {
              const answer = save(batch);
              return await new Promise<TransportOutcome>((resolve) => {
                const cancel = clock.after(server.slowMs, () => resolve(answer));
                signal.addEventListener('abort', () => {
                  cancel();
                  resolve({ kind: 'unanswered' });
                });
              });
            }
            case 'up':
              return save(batch);
          }
        } finally {
          underWay -= 1;
        }
      },
    },
  };
  return server;
}
