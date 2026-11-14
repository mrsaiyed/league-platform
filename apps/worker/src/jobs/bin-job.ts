// The `bin.empty` job (T7 §2, step 2.76): removes for good what has been in one league's
// bin for 30 days (T-51). No nightly timer queues it yet: step 2.91 builds the fan-out
// that queues one job per league each night. Each job runs inside its own league's
// fence (T-63); it holds no ids, the league is the job's own. The
// clock is given, so a test says what time it is. Run twice it does no harm (T-137): the
// second run finds nothing left. A failure is thrown and kept by the queue as a fixed
// code only (errorCodeOf), never a message.
import {
  emptyBin,
  type BinTx,
  type JobHandler,
  type QueuedJob,
  type TransactionRunner,
} from '@srleagues/core';

export type BinJobDeps = {
  /** One transaction for the job's league with no account set; commits when its work returns. */
  readonly transaction: TransactionRunner<BinTx>;
  /** The time now, as the worker's clock says it. */
  readonly now: () => Date;
};

export function runBinEmptying(deps: BinJobDeps): JobHandler {
  return async (job: QueuedJob) => {
    // No account: the worker acts for nobody (T-226). The job's id ties its log lines together.
    const context = { leagueId: job.leagueId, accountId: null, requestId: job.id };
    await deps.transaction(context, (tx) => emptyBin(tx, context, deps.now()));
  };
}
