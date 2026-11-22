// THE TEST COPY'S KEPT EMAILS (step 2.204, record 075 option 5, T-140). STAGING ONLY.
//
// On the test copy no email leaves the building: the capture keeps each one in the
// server's memory, lost at every restart. This sender hands each email to the capture as
// before and, when it is to a made-up address (record 075's list), also keeps its subject
// and plain words through `keep` (the database's public.keep_email, migration 0023, which
// checks the address again and keeps the newest 300). The lead reads one code or link with
// scripts/read-kept-emails.mjs.
//
// It refuses to be made for any APP_ENV but staging: production sends real email and
// writes nothing here; local work and tests keep their emails on disk (record 075). A
// failed keep never fails the email, and is told by its kind only: no address, no
// subject, no words (T4 §10, T-86).
import type { EmailMessage, EmailSender, SentEmail } from '@srleagues/core';
import type { EmailSettings } from './email-sender-for.ts';
import { isMadeUpAddress } from './made-up-address.ts';

/** What is kept of an email: with what it carries, a code or a link (`carries`). */
export type EmailKept = {
  readonly to: string;
  readonly kind: 'code' | 'link';
  readonly subject: string;
  readonly text: string;
};

/** Why an email was not kept, by its kind only. */
export type NotKeptKind = 'not-made-up' | 'refused' | 'fault';

export type KeptEmailSenderOptions = {
  readonly appEnv: EmailSettings['appEnv'];
  /** The capture the email goes to first, as before. */
  readonly sender: EmailSender;
  /** Keeps one email (the database's keepEmail); throws when it could not. */
  readonly keep: (email: EmailKept) => Promise<void>;
  /** Which kind a thrown error is (the database's keepFailureOf). */
  readonly failureOf: (error: unknown) => 'refused' | 'fault';
  /** Told when an email was not kept: its kind only. */
  readonly onNotKept: (kind: NotKeptKind) => void;
};

export function keptEmailSender(options: KeptEmailSenderOptions): EmailSender {
  if (options.appEnv !== 'staging') {
    throw new Error(
      `keptEmailSender: only the test copy (staging) keeps emails in its database, not ${options.appEnv} (record 075).`,
    );
  }
  return {
    send: async (message: EmailMessage): Promise<SentEmail> => {
      const sent = await options.sender.send(message);
      if (!isMadeUpAddress(message.to)) {
        options.onNotKept('not-made-up');
        return sent;
      }
      try {
        await options.keep({
          to: message.to,
          kind: message.carries ?? 'link',
          subject: message.subject,
          text: message.text,
        });
      } catch (error) {
        options.onNotKept(options.failureOf(error));
      }
      return sent;
    },
  };
}
