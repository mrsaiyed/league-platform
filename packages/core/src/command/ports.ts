// What a command needs from outside (T-21: core states it, database and providers
// supply it, the apps plug them in). Nothing here knows about SQL or a vendor.

/**
 * Who is acting, in which league, for which request (T-23). The server builds it
 * from the session (apps/web server/context.ts); it is never read from the input.
 */
export type CommandContext = {
  /** The league the request is for. */
  readonly leagueId: string;
  /** The signed-in account, or null for a visitor or the system. */
  readonly accountId: string | null;
  /** Shared by everything done for one request, so its log lines can be found together (T-196). */
  readonly requestId: string;
};

/**
 * A follow-up job: what to do and the ids it needs, never personal content (T-131).
 * jobProblem (job-rules.ts) says exactly what each part may hold.
 */
export type Job = {
  /** One of jobTypes (T7 §2): `email.send`. */
  readonly type: string;
  readonly leagueId: string;
  /** UUIDs under camelCase keys (dates under keys ending Date, Day, On); content is built when it runs. */
  readonly ids: Readonly<Record<string, string>>;
  /** Wait this many seconds before running it (a recap 10 minutes after the final). */
  readonly delaySeconds?: number;
  /**
   * Built from ids. A second job of this type with this key in the league is not
   * recorded, however often its cause repeats (T7 §1).
   */
  readonly dedupeKey?: string;
};

/** Records jobs in the transaction it belongs to, so they exist only if it commits (T-130). */
export type JobQueue = { readonly enqueue: (job: Job) => Promise<void> };

/** What every transaction a command runs in must offer. Modules add their stores. */
export type CommandTx = { readonly jobs: JobQueue };
// A Tx is a plain object of stores: defineCommand hands the command a copy of it
// with a checked job queue, so a class instance would lose its methods.

/**
 * Runs `work` in one transaction for the context's league and account, commits if it
 * returns and rolls back if it throws. packages/database supplies it.
 */
export type TransactionRunner<Tx extends CommandTx> = <T>(
  context: CommandContext,
  work: (tx: Tx) => Promise<T>,
) => Promise<T>;

/** Something a module announces once a command has done it (T-24). */
export type DomainEvent = { readonly type: string; readonly leagueId: string };

/**
 * Reacts to one type of event inside the same transaction as the command, so what
 * must be right at once (standings) is; what can wait (email) it records as a job.
 */
export type EventHandler<Tx extends CommandTx> = {
  readonly type: string;
  readonly handle: (event: DomainEvent, tx: Tx) => Promise<void>;
};

/** The T-196 line: ids, timing and outcome only, never names, emails or input. */
export type CommandLogLine = {
  readonly command: string;
  readonly requestId: string;
  readonly leagueId: string;
  readonly accountId: string | null;
  /** Null if the clock failed. */
  readonly durationMs: number | null;
  /** ok; refused: an expected error (its code is given); failed: something was thrown. */
  readonly outcome: 'ok' | 'refused' | 'failed';
  /** The expected error's code: a fixed word from the command's type, never built from input. */
  readonly errorCode?: string;
};

export type CommandDeps<Tx extends CommandTx> = {
  readonly transaction: TransactionRunner<Tx>;
  readonly events: readonly EventHandler<Tx>[];
  /** Must not throw; if it does, the command's outcome stands and the line is lost. */
  readonly log: (line: CommandLogLine) => void;
  /** Milliseconds from any fixed point; used only for durations. */
  readonly now: () => number;
};
