// packages/providers: one adapter per outside service, each behind an interface of
// our own (T-14, T2 §2), most of them ports core states. Used only through this file.
export {
  captureEmail,
  type CaptureEmail,
  type CaptureEmailOptions,
  type CapturedEmail,
} from './src/email/capture-email.ts';
export { emailSenderFor, type EmailSettings } from './src/email/email-sender-for.ts';
export { resendEmail, type ResendEmailOptions } from './src/email/resend-email.ts';
export * from './src/sign-in/index.ts';
export * from './src/live-updates/index.ts';
