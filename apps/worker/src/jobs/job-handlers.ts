// The handler for each job type the worker carries out (T7 §2). `email.send` has one kind
// today, the invitation email (ids `{ invitationId }`); other emails come with their own ids
// and are told apart here. `imports.run` reads an uploaded fixtures file (ids `{ importId }`)
// and is offered when the worker is given an imports transaction. `bin.empty` removes what has
// been in a league's bin for 30 days and is offered when the worker is given the bin's transaction.
import {
  binEmptyJob,
  importsRunJob,
  invitationEmailJob,
  type BinTx,
  type ImportsTx,
  type JobHandlers,
  type TransactionRunner,
} from '@srleagues/core';
import { runBinEmptying } from './bin-job.ts';
import { runImport } from './import-job.ts';
import { sendInvitationEmail, type InvitationEmailDeps } from './invitation-email-job.ts';

export type JobHandlerDeps = InvitationEmailDeps & {
  readonly importsTransaction?: TransactionRunner<ImportsTx>;
  /** Offered with the clock it runs by: the nightly emptying of the bin (step 2.76). */
  readonly bin?: { readonly transaction: TransactionRunner<BinTx>; readonly now: () => Date };
};

export function jobHandlers(deps: JobHandlerDeps): JobHandlers {
  return {
    [invitationEmailJob]: sendInvitationEmail(deps),
    ...(deps.importsTransaction === undefined
      ? {}
      : { [importsRunJob]: runImport({ transaction: deps.importsTransaction }) }),
    ...(deps.bin === undefined ? {} : { [binEmptyJob]: runBinEmptying(deps.bin) }),
  };
}
