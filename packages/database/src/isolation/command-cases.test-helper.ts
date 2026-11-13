// How core's commands run in the two-league harness (T-65). Each run of the harness
// has already opened a transaction, and a command opens its own, which the
// transaction guard refuses as nested (record 009). So here a command is given a
// transaction port that reuses the run's scope: the same transaction, stores bound
// to it, and nothing committed, since the harness rolls every run back.
//
// The command acts as the scope's account in the scope's league: B's owner in B
// (control), A's owner in A (app, code-only), the account with roles in both while
// the scope names B (both-leagues), nobody (no-league).
//
// What the harness judges: on success, the value together with every job the
// command (or a handler) recorded, so a job naming B's records is a leak. An
// expected error is thrown as a refusal, as the app would roll it back: a refusal in
// the target's own league fails the control run, and one naming B is a leak.
//
// Not verified until step 1.19: jobs here are collected in memory, not written in
// the same database transaction. Event handlers: pass the app's list as `events`
// once the apps wire one (none exists yet); the coverage test fails on a handler
// exported from core until then.
import type {
  Command,
  CommandDeps,
  CommandError,
  CommandTx,
  EventHandler,
  Job,
  JobQueue,
  LeaguesTx,
  TransactionRunner,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { openScope, transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { leaguesStore } from '../stores/index.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

/** Every module's stores, bound to the run's scope. Grows with each module. */
export function harnessTx(scope: LeagueScope, jobs: JobQueue): LeaguesTx {
  // The run's account counts as our staff, so commands only staff may run are tried
  // too: the worst case for isolation.
  const platformStaff = scope.accountId === null ? [] : [scope.accountId];
  return { jobs, leagues: leaguesStore(scope, { platformStaff }) };
}

/**
 * Runs `work` in a scope for a league that does not exist yet, in the run's own
 * transaction and account: how creating a league is tried (its id is set first,
 * record 008). The harness's scopes name existing leagues, so creating one there
 * would only collide with them.
 */
export async function inFreshLeague<T>(
  scope: LeagueScope,
  work: (fresh: LeagueScope) => Promise<T>,
): Promise<T> {
  const trx = transactionOf(scope);
  const leagueId = randomUUID();
  await sql`select set_config('app.league_id', ${leagueId}, true)`.execute(trx);
  return work(openScope(trx, leagueId, scope.accountId) as LeagueScope);
}

/** An expected error a command returned in the harness, with the error as its cause. */
export class CommandRefused extends Error {
  constructor(command: string, error: CommandError) {
    super(`${command} refused: ${error.code}`, { cause: error });
  }
}

/** A transaction port that runs the command in `scope` instead of opening one. */
function inScope<Tx extends CommandTx>(
  scope: LeagueScope,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => Tx,
  jobs: Job[],
): TransactionRunner<Tx> {
  return async (context, work) => {
    if (context.leagueId !== scope.leagueId || context.accountId !== scope.accountId) {
      throw new Error('The command was given a context other than the harness run.');
    }
    return work(makeTx(scope, { enqueue: async (job) => void jobs.push(job) }));
  };
}

export type CommandCaseOptions<Tx extends CommandTx> = {
  readonly events?: readonly EventHandler<Tx>[];
};

/** Runs `command` in the harness's scope, as that scope's account. */
export async function runInScope<Tx extends CommandTx>(
  command: Command<unknown, CommandError, Tx>,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => Tx,
  scope: LeagueScope,
  input: unknown,
  { events = [] }: CommandCaseOptions<Tx> = {},
): Promise<{ value: unknown; jobs: Job[] }> {
  const context = { leagueId: scope.leagueId, accountId: scope.accountId, requestId: 'harness' };
  const jobs: Job[] = [];
  const deps: CommandDeps<Tx> = {
    transaction: inScope(scope, makeTx, jobs),
    events,
    log: () => {},
    now: () => 0,
  };
  const result = await command(context, input, deps);
  if (!result.ok) throw new CommandRefused(command.commandName, result.error);
  return { value: result.value, jobs };
}

/** Adds a command to the harness, with input aimed at the target league's records. */
export function registerCommandCase<Tx extends CommandTx>(
  command: Command<unknown, CommandError, Tx>,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => Tx,
  {
    name,
    input,
    ...options
  }: CommandCaseOptions<Tx> & { name: string; input: (target: LeagueRecords) => unknown },
): void {
  registerIsolationCase({
    subject: command,
    name,
    run: (scope, target) => runInScope(command, makeTx, scope, input(target), options),
  });
}
