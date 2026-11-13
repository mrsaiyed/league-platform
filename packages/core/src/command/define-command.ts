// The one shape of every command (T-23):
//
//   command(context, input, deps) → result | expected error
//
// In this order: the input is checked against its schema; one transaction opens for
// the context's league and account; the policy says whether the account may run it
// (T-74), reading what it needs inside that transaction (T-75); the command does its
// work; the events it announced are handled in the same transaction (T-24); then it
// commits. An expected error, including "not allowed", rolls everything back, jobs
// recorded with it too. Anything thrown is unexpected: it rolls back and goes on up
// to be reported. An event or job for another league than the context's is refused
// by throwing, and so is a job carrying anything but ids (T-131, job-rules.ts). Every call writes one T-196 log line, whatever the outcome, and a
// failing log or clock never changes the outcome.
import type { z } from 'zod';
import { jobProblem } from './job-rules.ts';
import type {
  CommandContext,
  CommandDeps,
  CommandLogLine,
  CommandTx,
  DomainEvent,
  Job,
} from './ports.ts';
import {
  fail,
  ok,
  type CommandError,
  type InvalidInput,
  type NotAllowed,
  type Result,
} from './result.ts';

export type CommandDefinition<
  Schema extends z.ZodType,
  Value,
  Err extends CommandError,
  Tx extends CommandTx,
> = {
  /** `module.action`, as command receipts and the log store it. */
  readonly name: string;
  readonly input: Schema;
  /**
   * T4 §4: the permission this command needs, as the access module names it (or
   * one of its two non-role needs, "signed-in" and "platform-staff"). `allowed`
   * checks it, with the scope; the role-by-command test (T4 §12) runs every role
   * against the command as this name says, and fails a command whose name is
   * missing or unknown.
   */
  readonly permission: string;
  /** T-74: may the acting account run this, here, with this input? */
  readonly allowed: (context: CommandContext, input: z.output<Schema>, tx: Tx) => Promise<boolean>;
  readonly run: (args: {
    readonly context: CommandContext;
    readonly input: z.output<Schema>;
    readonly tx: Tx;
    /** Announces an event; its handlers run after `run` succeeds, before commit. */
    readonly emit: <Event extends DomainEvent>(event: Event) => void;
  }) => Promise<Result<Value, Err>>;
};

/**
 * A defined command: call it with (context, input, deps). The transaction may offer
 * more stores than the command's own (`T` beyond `Tx`): the apps' transaction has
 * every module's, so the event handlers, which belong to other modules (T-24), find
 * the stores they need in it.
 */
export type Command<Value, Err extends CommandError, Tx extends CommandTx> = (<T extends Tx>(
  context: CommandContext,
  input: unknown,
  deps: CommandDeps<T>,
) => Promise<Result<Value, Err | InvalidInput | NotAllowed>>) & {
  readonly commandName: string;
  readonly permission: string;
};

/** The clock, or null if it fails: a broken clock must not stop the log line. */
function readClock(deps: { readonly now: () => number }): number | null {
  try {
    const now = deps.now();
    return Number.isFinite(now) ? now : null;
  } catch {
    return null;
  }
}

/** The same format command_receipts.command and activity_log.action accept, with a module. */
const namePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function defineCommand<
  Schema extends z.ZodType,
  Value,
  Err extends CommandError,
  Tx extends CommandTx,
>(definition: CommandDefinition<Schema, Value, Err, Tx>): Command<Value, Err, Tx> {
  const { name } = definition;
  if (!namePattern.test(name) || name.length > 100) {
    throw new Error(`defineCommand: "${name}" is not a command name like "games.end_game".`);
  }
  const { permission } = definition;
  if (typeof permission !== 'string' || permission.trim() === '') {
    throw new Error(`defineCommand: ${name} names no permission (T4 §4).`);
  }

  async function execute<T extends Tx>(
    given: CommandContext,
    input: unknown,
    deps: CommandDeps<T>,
  ): Promise<Result<Value, Err | InvalidInput | NotAllowed>> {
    // Ids in lower case, as the database reads them, for every comparison and the log.
    const context: CommandContext = {
      leagueId: given.leagueId.toLowerCase(),
      accountId: given.accountId === null ? null : given.accountId.toLowerCase(),
      requestId: given.requestId,
    };
    const started = readClock(deps);
    let outcome: 'ok' | 'refused' | 'failed' = 'failed';
    let errorCode: string | undefined;
    try {
      const result = await attempt(context, input, deps);
      outcome = result.ok ? 'ok' : 'refused';
      if (!result.ok) errorCode = result.error.code;
      return result;
    } finally {
      const ended = readClock(deps);
      const line: CommandLogLine = {
        command: name,
        requestId: context.requestId,
        leagueId: context.leagueId,
        accountId: context.accountId,
        durationMs: started === null || ended === null ? null : Math.max(0, ended - started),
        outcome,
        ...(errorCode === undefined ? {} : { errorCode }),
      };
      try {
        deps.log(line);
      } catch {
        // A broken log must never replace the command's own answer or error, nor turn
        // a saved change into a failure. The logging adapter reports its own faults.
      }
    }
  }

  async function attempt<T extends Tx>(
    context: CommandContext,
    raw: unknown,
    deps: CommandDeps<T>,
  ): Promise<Result<Value, Err | InvalidInput | NotAllowed>> {
    const parsed = definition.input.safeParse(raw);
    if (!parsed.success) {
      // Zod's messages can repeat the value; keep only where and which check.
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        problem: issue.code,
      }));
      return fail({ code: 'invalid-input', issues });
    }
    const input = parsed.data;
    const sameLeague = (what: string, leagueId: string) => {
      if (leagueId.toLowerCase() !== context.leagueId) {
        throw new Error(`${name} ${what} for another league.`);
      }
    };
    // Thrown only to roll the transaction back; caught just below, never seen outside.
    const rollBack = new Error(`${name}: refused, rolling back`);
    const refused: { error?: Err | NotAllowed } = {};
    try {
      const value = await deps.transaction(context, async (given) => {
        // Every job, the command's or a handler's, is for the command's league. The tx
        // is a plain object of stores, so a copy with a checked queue is the same tx.
        const tx: T = {
          ...given,
          jobs: {
            enqueue: async (job: Job) => {
              sameLeague(`recorded the job ${job.type}`, job.leagueId);
              const problem = jobProblem(job);
              if (problem !== null) throw new Error(`${name} recorded a job that ${problem}.`);
              await given.jobs.enqueue(job);
            },
          },
        };
        if (!(await definition.allowed(context, input, tx))) {
          refused.error = { code: 'not-allowed' };
          throw rollBack;
        }
        const events: DomainEvent[] = [];
        const emit = (event: DomainEvent) => {
          sameLeague(`announced ${event.type}`, event.leagueId);
          events.push(event);
        };
        const result = await definition.run({ context, input, tx, emit });
        if (!result.ok) {
          refused.error = result.error;
          throw rollBack;
        }
        for (const event of events) {
          for (const handler of deps.events) {
            if (handler.type === event.type) await handler.handle(event, tx);
          }
        }
        return result.value;
      });
      return ok(value);
    } catch (thrown) {
      if (thrown === rollBack && refused.error !== undefined) return fail(refused.error);
      throw thrown;
    }
  }

  // Named for the command, so failures and the harness's reports say which one.
  Object.defineProperty(execute, 'name', { value: name });
  return Object.assign(execute, { commandName: name, permission });
}
