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
