// The invitation email (T7 §2 `email.send` with ids `{ invitationId }`, T-226,
// record 014). The job holds the invitation's id and nothing else (T-131); the link
// is made here, as the email is sent, and exists only in that email.
//
// The order is the rule (record 014):
//   1. In a transaction for the job's league with no account set, read the league,
//      call issueInvitationLink, and build the address and the whole email, then
//      COMMIT, so the new link's hash is stored.
//   2. Only then hand the email to the email service.
// Sending first could email a link whose hash was never stored, and it would never
// work. Building the email inside the transaction means a mistake in building it
// rolls the new link back, so no link is ever replaced by one that was never sent;
// such a mistake also fails the job at once (EmailNotBuiltError), since trying again
// builds the same email. The settings it needs (our origin, the sending address) are
// checked once when the handler is made, before any job runs (record 023).
//
// A job run twice sends two emails: the second link works and the first stops
// working (accepted, record 014). Each link is its own email: the idempotency key is
// made from the link, so the service never drops the second email as a repeat of the
// first, and one send of one link is never delivered twice (T-137). It follows that a
// retry after the service's answer was lost or unreadable (`unavailable`,
// `unexpected-answer`) may send a second email, whose link ends the first (record 023).
//
// Nothing to send (the invitation is no longer pending, the league takes no new
// people, its program is gone, the sender can no longer give the role): the job
// finishes quietly. A failure is thrown and kept by the queue as a fixed code only
// (errorCodeOf); no message, log line or job row here holds the link or the address.
import { createHash } from 'node:crypto';
import {
  checkedSiteOrigin,
  invitationLifetimeDays,
  issueInvitationLink,
  leagueUrl,
  type AccessTx,
  type EmailMessage,
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

/**
 * The email could not be built from what is stored (the league's short name is not of
 * the right form, say). The new link was rolled back with it; trying again would build
 * the same email, so the job fails at once. Kept as `unexpected`, never the cause's
 * message.
 */
export class EmailNotBuiltError extends Error {
  readonly code = 'unexpected';
  readonly retryable = false;
  constructor() {
    super('The invitation email could not be built.');
    this.name = 'EmailNotBuiltError';
  }
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The idempotency key for the email of one link: the same link is sent once, a new link anew. */
function emailKeyFor(invitationId: string, token: string): string {
  const ofLink = createHash('sha256').update(`invitation-email:${token}`).digest('hex');
  return `invitation-${invitationId.toLowerCase()}-${ofLink.slice(0, 32)}`;
}

/**
 * Checks the worker's settings for this email: our origin as leagueUrl takes it, and a
 * sending address fromHeader accepts. Throws a TypeError naming the setting, never its
 * value. Returns the origin as links use it.
 */
export function checkedInvitationEmailSettings(
  settings: Pick<InvitationEmailDeps, 'siteOrigin' | 'sendingAddress'>,
): string {
  let siteUrl: string;
  try {
    siteUrl = checkedSiteOrigin(settings.siteOrigin);
  } catch {
    throw new TypeError('The site origin setting is not an origin like https://site.');
  }
  try {
    fromHeader('', settings.sendingAddress);
  } catch {
    throw new TypeError('The sending address setting is not one plain email address.');
  }
  return siteUrl;
}

/**
 * The handler for `email.send`. Throws at once, before any job runs, when our origin
 * or the sending address is not one the email could use (record 023).
 */
export function sendInvitationEmail(deps: InvitationEmailDeps): JobHandler {
  const t = createTranslator('en');
  const siteUrl = checkedInvitationEmailSettings(deps);

  return async (job: QueuedJob) => {
    const invitationId = job.ids['invitationId'];
    if (invitationId === undefined || !uuidShape.test(invitationId)) throw new BadJobDataError();
    // No account: the worker acts for nobody (T-226). The job's id ties its log lines together.
    const context = { leagueId: job.leagueId, accountId: null, requestId: job.id };

    // 1. Make the link and the whole email, and commit (nothing is sent before it returns).
    const message = await deps.transaction(
      context,
      async (tx): Promise<EmailMessage | undefined> => {
        const league = await tx.leagues.currentLeague();
        if (league === undefined) return undefined;
        const link = await issueInvitationLink(tx, invitationId);
        if (link === undefined) return undefined;
        try {
          const acceptUrl = leagueUrl(league, 'invitation', {
            token: link.token,
            origin: siteUrl,
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
          return {
            from: fromHeader(league.name, deps.sendingAddress),
            to: link.invitation.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            idempotencyKey: emailKeyFor(link.invitation.id, link.token),
          };
        } catch {
          // Thrown inside the transaction, so the new link is rolled back with it.
          throw new EmailNotBuiltError();
        }
      },
    );
    if (message === undefined) return;

    // 2. Only now, the email.
    await deps.email.send(message);
  };
}
