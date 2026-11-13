// T-140: which email sender an environment gets. Only production sends real email
// (Resend); local work, tests and staging capture every email instead, whatever
// keys they are given, so a test can never email a real person (with T-13).
import type { EmailSender } from '@srleagues/core';
import { captureEmail, type CaptureEmail } from './capture-email.ts';
import { resendEmail } from './resend-email.ts';

export type EmailSettings = {
  readonly appEnv: 'local' | 'test' | 'staging' | 'production';
  /** Used only in production. */
  readonly resendApiKey?: string | undefined;
  /** Where captured emails are written as files, outside production. */
  readonly captureDirectory?: string | undefined;
};

export function emailSenderFor(
  settings: EmailSettings,
): { kind: 'resend'; sender: EmailSender } | { kind: 'capture'; sender: CaptureEmail } {
  if (settings.appEnv !== 'production') {
    const capture = captureEmail(
      settings.captureDirectory === undefined ? {} : { directory: settings.captureDirectory },
    );
    return { kind: 'capture', sender: capture };
  }
  if (settings.resendApiKey === undefined || settings.resendApiKey.trim() === '') {
    throw new Error('emailSenderFor: production needs RESEND_API_KEY.');
  }
  return { kind: 'resend', sender: resendEmail({ apiKey: settings.resendApiKey }) };
}
