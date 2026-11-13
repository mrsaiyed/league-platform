// The sign-in emails, sent through our own email service (T4 §3): the code (T-67),
// the new-device notice (T-70) and the password-changed notice (T-85). The sign-in
// service decides when a code is due; the flows decide when a notice is (flows.ts).
//
// A code asked for an address with no account (a reset) comes with no code, and
// nothing is sent: the work done before that point is the same either way (T-68).
import { fail, ok, platformUrl, type EmailSender } from '@srleagues/core';
import {
  fromHeader,
  newDeviceEmail,
  passwordChangedEmail,
  signInCodeEmail,
  type RenderedEmail,
} from '@srleagues/emails';
import type { SignInCodeSender } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { locale, t } from '../messages.ts';

export type SignInMail = {
  readonly codeSender: SignInCodeSender;
  /** Never throws: a notice that could not be sent must not undo the sign-in. */
  readonly newDevice: (to: string, deviceLabel: string, at: Date) => Promise<void>;
  readonly passwordChanged: (to: string, at: Date) => Promise<void>;
};

export type SignInMailOptions = {
  readonly sender: EmailSender;
  /** EMAIL_FROM, the sign-in emails' own sending address. */
  readonly fromAddress: string;
  /** PUBLIC_BASE_URL. */
  readonly siteOrigin: string;
  /** Told when a notice could not be sent. Gets no address and no content (T-86). */
  readonly onNoticeFailed: (kind: 'new-device' | 'password-changed') => void;
  /** The clock the sign-in service uses, for how long a code still works. */
  readonly now: () => Date;
};

export function createSignInMail(options: SignInMailOptions): SignInMail {
  const from = fromHeader(t('shell.siteName'), options.fromAddress);
  const siteUrl = options.siteOrigin;
  const send = (to: string, email: RenderedEmail) =>
    options.sender.send({ from, to, ...email, idempotencyKey: randomUUID() });

  return {
    codeSender: {
      send: async (message) => {
        if (message.code === null) return ok({ queued: true as const });
        const email = signInCodeEmail(
          {
            purpose: message.purpose,
            code: message.code,
            validMinutes: Math.max(
              1,
              Math.round((message.expiresAt.getTime() - options.now().getTime()) / 60_000),
            ),
            accountExists: message.accountExists,
            siteUrl,
          },
          t,
        );
        try {
          await send(message.to, email);
          return ok({ queued: true as const });
        } catch {
          return fail({ code: 'code-not-sent' as const });
        }
      },
    },
    newDevice: async (to, deviceLabel, at) => {
      const email = newDeviceEmail(
        {
          deviceLabel,
          when: timeInWords(at),
          accountUrl: siteUrl + platformUrl('account'),
          siteUrl,
        },
        t,
      );
      await send(to, email).catch(() => options.onNoticeFailed('new-device'));
    },
    passwordChanged: async (to, at) => {
      const email = passwordChangedEmail(
        { when: timeInWords(at), resetUrl: siteUrl + platformUrl('forgotPassword'), siteUrl },
        t,
      );
      await send(to, email).catch(() => options.onNoticeFailed('password-changed'));
    },
  };
}

/** "Nov 13, 2026, 12:00 PM UTC". The person's own time zone comes with their settings. */
export function timeInWords(at: Date): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(at);
}
