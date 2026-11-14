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
// Jobs are written to the jobs table in the run's transaction (jobsStore, step
// 1.19), and kept for the harness to judge as well. Every command case runs with
// core's event handlers (eventHandlers, as the apps pass them), in the command's own
// transaction, so what a handler does is judged with the command. Each handler also
// has cases of its own (registerHandlerCase): run in another league's scope with an
// event naming the target's records, and judged by what it writes too, since a
// command aimed at the target is refused there before any handler runs.
import {
  eventHandlers,
  type AccessTx,
  type Command,
  type CommandDeps,
  type CommandError,
  type CommandTx,
  type DomainEvent,
  type EventHandler,
  type GamesTx,
  type ImportScoresTx,
  type Job,
  type JobQueue,
  type LeaguesTx,
  type PeopleTx,
  type SchedulingTx,
  type StandingsTx,
  type TeamsTx,
  type TransactionRunner,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { openScope, transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  accessStore,
  activityLogStore,
  divisionsStore,
  gamesStore,
  importsStore,
  jobsStore,
  leaguesStore,
  peopleStore,
  schedulingStore,
  standingsStore,
  teamsStore,
} from '../stores/index.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

/** Every module's store, as the apps' transaction offers them. Grows with each module. */
export type HarnessTx = ImportScoresTx &
  LeaguesTx &
  SchedulingTx &
  GamesTx &
  PeopleTx &
  TeamsTx &
  AccessTx &
  StandingsTx;

/** Every module's stores, bound to the run's scope. Grows with each module. */
export function harnessTx(scope: LeagueScope, jobs: JobQueue): HarnessTx {
  // The run's account counts as our staff, so commands only staff may run are tried
  // too: the worst case for isolation.
  const platformStaff = scope.accountId === null ? [] : [scope.accountId];
  return {
    jobs,
    leagues: leaguesStore(scope, { platformStaff }),
    divisions: divisionsStore(scope),
    scheduling: schedulingStore(scope),
    games: gamesStore(scope),
    imports: importsStore(scope),
    people: peopleStore(scope),
    teams: teamsStore(scope),
    standings: standingsStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  };
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
    const recorded = jobsStore(scope);
    return work(
      makeTx(scope, {
        // Kept for the harness to judge, and written in the run's transaction as the
        // app's command transaction writes it (T-130).
        enqueue: async (job) => {
          jobs.push(job);
          await recorded.enqueue(job);
        },
      }),
    );
  };
}

export type CommandCaseOptions<Tx extends CommandTx> = {
  readonly events?: readonly EventHandler<Tx>[];
};

/**
 * Runs `command` in the harness's scope, as that scope's account, with the handlers
 * given (none unless given: a planted command's transaction may lack their stores).
 */
export async function runInScope<Tx extends CommandTx, T extends Tx>(
  command: Command<unknown, CommandError, Tx>,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => T,
  scope: LeagueScope,
  input: unknown,
  { events = [] }: CommandCaseOptions<T> = {},
): Promise<{ value: unknown; jobs: Job[] }> {
  const context = { leagueId: scope.leagueId, accountId: scope.accountId, requestId: 'harness' };
  const jobs: Job[] = [];
  const deps: CommandDeps<T> = {
    transaction: inScope(scope, makeTx, jobs),
    events,
    log: () => {},
    now: () => 0,
  };
  const result = await command(context, input, deps);
  if (!result.ok) throw new CommandRefused(command.commandName, result.error);
  return { value: result.value, jobs: jobs.map(withoutSecrets) };
}

/**
 * A job's link token (an invitation's, T-226) is a fresh random secret, new in each
 * run as a new row's id is, so it is set aside when runs are compared. No league's
 * rows hold a token (only its hash), so no leak could be read from it anyway.
 */
function withoutSecrets(job: Job): Job {
  if (!('token' in job.ids)) return job;
  return { ...job, ids: { ...job.ids, token: '(new token)' } };
}

/** Runs `command` as the apps do: every module's stores and core's event handlers. */
export function runAsApp<Tx extends CommandTx>(
  command: Command<unknown, CommandError, Tx>,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => HarnessTx & Tx,
  scope: LeagueScope,
  input: unknown,
): Promise<{ value: unknown; jobs: Job[] }> {
  return runInScope(command, makeTx, scope, input, { events: eventHandlers });
}

/**
 * Adds a command to the harness, with input aimed at the target league's records. It
 * runs as the apps run it (runAsApp), so the handlers of the events it announces run
 * in its transaction and are judged with it.
 */
export function registerCommandCase<Tx extends CommandTx>(
  command: Command<unknown, CommandError, Tx>,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => HarnessTx & Tx,
  { name, input }: { name: string; input: (target: LeagueRecords) => unknown },
): void {
  registerIsolationCase({
    subject: command,
    name,
    run: (scope, target) => runAsApp(command, makeTx, scope, input(target)),
  });
}

/**
 * Adds an event handler to the harness: it runs in the scope's transaction with every
 * module's stores, for an event in the scope's league that names the target's
 * records, and is judged by what it returns (its jobs) and what it writes.
 */
export function registerHandlerCase(
  handler: EventHandler<HarnessTx>,
  {
    name,
    event,
  }: {
    name: string;
    event: (scope: LeagueScope, target: LeagueRecords) => DomainEvent;
  },
): void {
  registerIsolationCase({
    subject: handler.handle,
    name,
    compareWrites: true,
    run: (scope, target) => runHandler(handler, harnessTx, scope, event(scope, target)),
  });
}

/** Runs one event handler in the scope's transaction; returns the jobs it recorded. */
export async function runHandler<T extends CommandTx>(
  handler: EventHandler<T>,
  makeTx: (scope: LeagueScope, jobs: JobQueue) => T,
  scope: LeagueScope,
  event: DomainEvent,
): Promise<{ jobs: Job[] }> {
  const jobs: Job[] = [];
  const recorded = jobsStore(scope);
  const tx = makeTx(scope, {
    enqueue: async (job) => {
      jobs.push(job);
      await recorded.enqueue(job);
    },
  });
  await handler.handle(event, tx);
  return { jobs: jobs.map(withoutSecrets) };
}
