// The invitation email (T7 §2 `email.send` with ids `{ invitationId }`, T-226,
// record 014). The job holds the invitation's id and nothing else (T-131); the link
// is made here, as the email is sent, and exists only in that email.
//
// The order is the rule (record 014):
//   1. In a transaction for the job's league with no account set, read the league
//      and call issueInvitationLink, and COMMIT, so the new link's hash is stored.
//   2. Only then render the email and hand it to the email service.
// Sending first could email a link whose hash was never stored, and it would never
// work. So a job run twice sends two emails: the second link works and the first
// stops working (accepted, record 014). Each link is its own email: the idempotency
// key is made from the link, so the service never drops the second email as a
// repeat of the first, and one send of one link is never delivered twice (T-137).
//
// Nothing to send (the invitation is no longer pending, the league takes no new
// people, its program is gone, the sender can no longer give the role): the job
// finishes quietly. A failure is thrown and kept by the queue as a fixed code only
// (errorCodeOf); no message, log line or job row here holds the link or the address.
import { createHash } from 'node:crypto';
import {
  invitationLifetimeDays,
  issueInvitationLink,
  leagueUrl,
  type AccessTx,
  type EmailSender,
  type JobHandler,
  type LeaguesStore,
  type QueuedJob,
  type TransactionRunner,
} from '@srleagues/core';
import { fromHeader, invitationEmail } from '@srleagues/emails';
import { createTranslator } from '@srleagues/site';

/** What the job's transaction offers: the access module's stores and the league's own row. */
export type InvitationEmailTx = AccessTx & {
  readonly leagues: Pick<LeaguesStore, 'currentLeague'>;
};

export type InvitationEmailDeps = {
  /** One transaction for the job's league; commits when its work returns. */
  readonly transaction: TransactionRunner<InvitationEmailTx>;
  readonly email: EmailSender;
  /** Our site's origin, such as `https://oursite.com`, for the link (T-34). */
  readonly siteOrigin: string;
  /** The address league mail is sent from; the league's name goes before it (T7 §6). */
  readonly sendingAddress: string;
};

/** A job whose ids cannot be this job's: trying again cannot help. */
export class BadJobDataError extends Error {
  readonly code = 'bad_job_data';
  readonly retryable = false;
  constructor() {
    super('The email.send job has no invitationId.');
    this.name = 'BadJobDataError';
  }
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The idempotency key for the email of one link: the same link is sent once, a new link anew. */
function emailKeyFor(invitationId: string, token: string): string {
  const ofLink = createHash('sha256').update(`invitation-email:${token}`).digest('hex');
  return `invitation-${invitationId.toLowerCase()}-${ofLink.slice(0, 32)}`;
}

export function sendInvitationEmail(deps: InvitationEmailDeps): JobHandler {
  const t = createTranslator('en');
  const siteUrl = new URL(deps.siteOrigin).origin;

  return async (job: QueuedJob) => {
    const invitationId = job.ids['invitationId'];
    if (invitationId === undefined || !uuidShape.test(invitationId)) throw new BadJobDataError();
    // No account: the worker acts for nobody (T-226). The job's id ties its log lines together.
    const context = { leagueId: job.leagueId, accountId: null, requestId: job.id };

    // 1. Make the link, and commit (the transaction returns before anything is sent).
    const made = await deps.transaction(context, async (tx) => {
      const league = await tx.leagues.currentLeague();
      if (league === undefined) return undefined;
      const link = await issueInvitationLink(tx, invitationId);
      return link === undefined ? undefined : { league, link };
    });
    if (made === undefined) return;

    // 2. Only now, the email.
    const { league, link } = made;
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
        siteUrl,
      },
      t,
    );
    await deps.email.send({
      from: fromHeader(league.name, deps.sendingAddress),
      to: link.invitation.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: emailKeyFor(link.invitation.id, link.token),
    });
  };
}
