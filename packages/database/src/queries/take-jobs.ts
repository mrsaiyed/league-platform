// The worker takes due jobs from every league (record 012) through public.take_jobs,
// the one owner-run function that looks across leagues at jobs. It runs in a
// transaction with no league and no account set (the database refuses any other),
// leases what it returns to this worker for `leaseSeconds`, and returns ids only.
// Each job taken counts an attempt. Its scope type admits no league scope, so a
// command's or request's code cannot compile a call to it with one.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

/** A scope with no league: what withTransaction(db, {}) opens. A LeagueScope is not one. */
export type NoLeagueScope = AppScope & { readonly leagueId?: never };

/** A job a worker holds: what to run, and the lease that proves it holds it. */
export type TakenJob = {
  readonly id: string;
  readonly type: string;
  readonly leagueId: string;
  readonly ids: Readonly<Record<string, string>>;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly leaseToken: string;
};

type Row = {
  job_id: string;
  job_league_id: string;
  job_type: string;
  job_ids: Record<string, string>;
  job_attempt: number;
  job_max_attempts: number;
  job_lease_token: string;
};

export async function takeJobs(
  scope: NoLeagueScope,
  howMany: number,
  leaseSeconds: number,
): Promise<TakenJob[]> {
  const { rows } = await sql<Row>`
    select * from public.take_jobs(${howMany}::integer, ${leaseSeconds}::integer)`.execute(
    transactionOf(scope),
  );
  return rows.map((row) => ({
    id: row.job_id,
    type: row.job_type,
    leagueId: row.job_league_id,
    ids: row.job_ids,
    attempt: row.job_attempt,
    maxAttempts: row.job_max_attempts,
    leaseToken: row.job_lease_token,
  }));
}
