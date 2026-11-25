// A stand-in for the database in core's tests: a transaction works on a copy of the
// state and its jobs are held back; both are kept only if the work returns, so a
// test can see that a refused or failed command left nothing behind.
import type {
  CommandContext,
  CommandDeps,
  CommandLogLine,
  CommandTx,
  EventHandler,
  Job,
  JobQueue,
  TransactionRunner,
} from '../ports.ts';

export type MemoryDatabase<State> = { state: State; jobs: Job[]; opened: CommandContext[] };

export function memoryDatabase<State>(state: State): MemoryDatabase<State> {
  return { state, jobs: [], opened: [] };
}

export function memoryTransaction<State, Tx extends CommandTx>(
  db: MemoryDatabase<State>,
  makeTx: (state: State, jobs: JobQueue) => Tx,
): TransactionRunner<Tx> {
  return async (context, work) => {
    db.opened.push(context);
    const draft = structuredClone(db.state);
    const staged: Job[] = [];
    const result = await work(makeTx(draft, { enqueue: async (job) => void staged.push(job) }));
    db.state = draft;
    db.jobs.push(...staged);
    return result;
  };
}

/** Deps for a test: log lines kept in `lines`, a clock that moves 5 ms per reading. */
export function testDeps<Tx extends CommandTx>(
  transaction: TransactionRunner<Tx>,
  events: readonly EventHandler<Tx>[] = [],
): CommandDeps<Tx> & { lines: CommandLogLine[] } {
  const lines: CommandLogLine[] = [];
  let clock = 1000;
  return {
    transaction,
    events,
    log: (line) => void lines.push(line),
    now: () => (clock += 5),
    lines,
  };
}

/**
 * A transaction whose stores write down each call, as "store.method" (and
 * "store.part.method" one level in), in `calls`, in the order made: for a test that
 * one call comes before another (T-403, the league's row before any read).
 */
export function recordingTransaction<Tx extends CommandTx>(
  transaction: TransactionRunner<Tx>,
  calls: string[],
): TransactionRunner<Tx> {
  return (context, work) => transaction(context, (tx) => work(recorded(tx, '', calls)));
}

function recorded<T extends object>(target: T, path: string, calls: string[]): T {
  return new Proxy(target, {
    get(inner, key, receiver) {
      const value: unknown = Reflect.get(inner, key, receiver);
      const name = path === '' ? String(key) : `${path}.${String(key)}`;
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(name);
          return (value as (...given: unknown[]) => unknown).apply(inner, args);
        };
      }
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? recorded(value, name, calls)
        : value;
    },
  });
}
