// THE WORKER'S INVITATION EMAIL, DONE BY THE WEB APP ITSELF, ON THE MADE-UP DATABASE ONLY
// (step 2.97, record 086). NEVER ON A REAL DATABASE.
//
// Inviting and re-sending record an `email.send` job; the worker (apps/worker) sends the
// email and makes the link as it does (T-226, record 014). The made-up database lives in
// the web app's own memory (record 055), where no worker can reach it, so an invitation
// made there was never sent and its link never existed. Here the web app takes the
// worker's turn, as the made-up stand-in already does for a fixtures import
// (stand-in-world.ts): right after an invitation is made or re-sent, the due jobs of the
// jobs table are run through the same queue the worker uses in local work (the table
// queue), with this handler for `email.send`, and the email goes to the made-up capture,
// which keeps it for the kept emails' page (step 2.96).
//
// It does what the worker's job does, in the same order (record 014): in a transaction for
// the job's league with no account, make the link (issueInvitationLink) and build the whole
// email, commit, and only then hand it over. It is built only by startup's made-up
// database branch, so a real database's ports have none (database-ports.ts gives null).
// It is the one file outside the worker that may name issueInvitationLink (structure rule
// T-226, scripts/structure/config.mjs). No log line holds the link or the address.
import { createHash } from 'node:crypto';
import {
  invitationEmailJob,
  invitationLifetimeDays,
  issueInvitationLink,
  leagueUrl,
  type AccessTx,
  type EmailMessage,
  type EmailSender,
  type JobHandlers,
  type LeaguesStore,
  type QueuedJob,
  type TransactionRunner,
} from '@srleagues/core';
import { fromHeader, invitationEmail } from '@srleagues/emails';
import { createTranslator } from '@srleagues/site';

/** What the job's transaction offers: the access module's stores and the league's own row. */
export type MadeUpInvitationTx = AccessTx & {
  readonly leagues: Pick<LeaguesStore, 'currentLeague'>;
};

export type MadeUpInvitationMailDeps = {
  readonly transaction: TransactionRunner<MadeUpInvitationTx>;
  /** The made-up capture, which keeps emails to made-up addresses (kept-emails.ts). */
  readonly email: EmailSender;
  /** PUBLIC_BASE_URL: on made-up data always this computer or a test name. */
  readonly siteOrigin: string;
  /** EMAIL_FROM. */
  readonly sendingAddress: string;
  /** Runs every due job of the jobs table with these handlers (the table queue's runDue). */
  readonly runDue: (handlers: JobHandlers) => Promise<number>;
};

/** Sends the invitation emails waiting in the jobs table now: the worker's turn. */
export type SendQueuedInvitations = () => Promise<void>;

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function madeUpInvitationMail(deps: MadeUpInvitationMailDeps): SendQueuedInvitations {
  const t = createTranslator('en');
  const handler = async (job: QueuedJob) => {
    const invitationId = job.ids['invitationId'];
    // As the worker: a job that is not an invitation's cannot be helped by trying again.
    if (invitationId === undefined || !uuidShape.test(invitationId)) {
      throw Object.assign(new Error('The email.send job has no invitationId.'), {
        code: 'bad_job_data',
        retryable: false,
      });
    }
    const context = { leagueId: job.leagueId, accountId: null, requestId: job.id };
    const message = await deps.transaction(
      context,
      async (tx): Promise<EmailMessage | undefined> => {
        const league = await tx.leagues.currentLeague();
        if (league === undefined) return undefined;
        const link = await issueInvitationLink(tx, invitationId);
        if (link === undefined) return undefined;
        const acceptUrl = leagueUrl(league, 'invitation', {
          token: link.token,
          origin: deps.siteOrigin,
        });
        const rendered = invitationEmail(
          {
            leagueName: league.name,
            roleName: t(`role.${link.invitation.role}`),
            acceptUrl,
            lifetimeDays: invitationLifetimeDays,
            siteUrl: deps.siteOrigin,
          },
          t,
        );
        const ofLink = createHash('sha256').update(`invitation-email:${link.token}`).digest('hex');
        return {
          from: fromHeader(league.name, deps.sendingAddress),
          to: link.invitation.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: `invitation-${link.invitation.id}-${ofLink.slice(0, 32)}`,
        };
      },
    );
    if (message !== undefined) await deps.email.send(message);
  };
  // Only `email.send` is handled: on the made-up database nothing else is queued by the
  // web app today (fixture imports are not on the database yet, the bin is the worker's
  // nightly job), and a job of another kind would wait and be tried again, as the
  // worker's queue does with a job it has no handler for.
  return async () => {
    await deps.runDue({ [invitationEmailJob]: handler });
  };
}
