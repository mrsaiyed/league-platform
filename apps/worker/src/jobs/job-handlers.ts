// The handler for each job type the worker carries out (T7 §2). `email.send` has one kind
// today, the invitation email (ids `{ invitationId }`); other emails come with their own ids
// and are told apart here. `imports.run` reads an uploaded fixtures file (ids `{ importId }`)
// and is offered when the worker is given an imports transaction.
import {
  importsRunJob,
  invitationEmailJob,
  type ImportsTx,
  type JobHandlers,
  type TransactionRunner,
} from '@srleagues/core';
import { runImport } from './import-job.ts';
import { sendInvitationEmail, type InvitationEmailDeps } from './invitation-email-job.ts';

export type JobHandlerDeps = InvitationEmailDeps & {
  readonly importsTransaction?: TransactionRunner<ImportsTx>;
};

export function jobHandlers(deps: JobHandlerDeps): JobHandlers {
  return {
    [invitationEmailJob]: sendInvitationEmail(deps),
    ...(deps.importsTransaction === undefined
      ? {}
      : { [importsRunJob]: runImport({ transaction: deps.importsTransaction }) }),
  };
}
