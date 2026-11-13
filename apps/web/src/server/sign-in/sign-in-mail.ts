// The sign-in emails, sent through our own email service (T4 §3): the code (T-67),
// the new-device notice (T-70) and the password-changed notice (T-85). The sign-in
// service decides when a code is due; the flows decide when a notice is (flows.ts).
//
// T-68: asking for a code must answer the same, in the same time, whether or not the
// address has an account. A reset for an address with no account comes with no
// code and nothing is sent; so the request never waits for the email service, nor
// learns whether it took the email: the email is drawn either way, handed over
// without waiting, and a failure is only reported (with no address and no content,
// T-86). The person who got nothing asks again. In production this should become a
// job recorded for every request, whose run sends nothing when there is no code
// (record 031).
import { ok, platformUrl, type EmailSender } from '@srleagues/core';
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
  /** Told when an email could not be sent. Gets no address and no content (T-86). */
  readonly onNoticeFailed: (kind: 'code' | 'new-device' | 'password-changed') => void;
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
        const email = signInCodeEmail(
          {
            purpose: message.purpose,
            code: message.code ?? '000000',
            validMinutes: Math.max(
              1,
              Math.round((message.expiresAt.getTime() - options.now().getTime()) / 60_000),
            ),
            accountExists: message.accountExists,
            siteUrl,
          },
          t,
        );
        if (message.code !== null) {
          // Not awaited (see above). Any failure, thrown or rejected, is only reported.
          void Promise.resolve()
            .then(() => send(message.to, email))
            .catch(() => options.onNoticeFailed('code'));
        }
        return ok({ queued: true as const });
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
