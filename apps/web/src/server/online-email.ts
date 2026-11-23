// The email sender of the website on a real database (staging and production; T-140,
// step 2.204, record 098). Production sends through Resend (emailSenderFor) and keeps
// nothing. Staging, the test copy, captures every email as before, and also keeps each one
// to a made-up address in its own database (keptEmailSender, migration 0023), so the lead
// can read a code or link with scripts/read-kept-emails.mjs after any restart. An email
// not kept is told by its kind only (T4 §10).
import type { EmailSender } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import {
  emailSenderFor,
  keptEmailSender,
  type EmailSettings,
  type NotKeptKind,
} from '@srleagues/providers';

/** What the sender needs of packages/database. */
export type KeptEmailsDatabase = Pick<typeof DatabaseModule, 'keepEmail' | 'keepFailureOf'>;

export type OnlineEmailSettings = {
  /** Only staging keeps; local and test never reach a real database here (startup.ts). */
  readonly appEnv: EmailSettings['appEnv'];
  readonly resendApiKey?: string | undefined;
};

export function onlineEmailSender(
  settings: OnlineEmailSettings,
  database: KeptEmailsDatabase,
  db: DatabaseHandle,
  onNotKept: (kind: NotKeptKind) => void,
): EmailSender {
  const chosen = emailSenderFor(settings);
  if (chosen.kind === 'resend' || settings.appEnv !== 'staging') return chosen.sender;
  return keptEmailSender({
    appEnv: settings.appEnv,
    sender: chosen.sender,
    keep: (email) => database.keepEmail(db, email),
    failureOf: database.keepFailureOf,
    onNotKept,
  });
}
