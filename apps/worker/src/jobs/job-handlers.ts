// The handler for each job type the worker carries out (T7 §2). Today `email.send`
// has one kind, the invitation email (ids `{ invitationId }`); other emails come with
// their own ids and are told apart here.
import { invitationEmailJob, type JobHandlers } from '@srleagues/core';
import { sendInvitationEmail, type InvitationEmailDeps } from './invitation-email-job.ts';

export type JobHandlerDeps = InvitationEmailDeps;

export function jobHandlers(deps: JobHandlerDeps): JobHandlers {
  return { [invitationEmailJob]: sendInvitationEmail(deps) };
}
