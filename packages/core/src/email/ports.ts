// "Something that can send an email" (T2 §2): core states it, packages/providers
// supplies it. Outside production the capture adapter stands in, so no email leaves
// the machine (T-140); in production, Resend (T-11).

/** One email to one person, already rendered (packages/emails). */
export type EmailMessage = {
  /** The sending address, with the league's name: `"North League" <hello@example.test>`. */
  readonly from: string;
  readonly to: string;
  /** The league's contact address (T7 §6). */
  readonly replyTo?: string;
  readonly subject: string;
  readonly html: string;
  /** The plain-text version every template has. */
  readonly text: string;
  /** Extra headers, such as the one-click unsubscribe header (T7 §6). */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * The same for every attempt to send this one email, so the email service sends it
   * once however often it is handed over (T-137). What "this one email" is belongs to
   * the job: for an email whose content is fixed by the job's ids it is built from
   * those ids; the invitation email holds a new link on every run, so its key is per
   * link (record 023), and a retry after an answer that was lost or unreadable can
   * send a second email, whose link ends the first.
   */
  readonly idempotencyKey: string;
};

/** The email service's id for a message it accepted. */
export type SentEmail = { readonly id: string };

export type EmailSender = {
  /** Hands the email over. Throws EmailSendError when it was not accepted. */
  readonly send: (message: EmailMessage) => Promise<SentEmail>;
};
