// packages/providers: one adapter per outside service, each behind an interface of
// our own (T-14, T2 §2), most of them ports core states. Used only through this file.
export {
  captureEmail,
  type CaptureEmail,
  type CaptureEmailOptions,
  type CapturedEmail,
} from './src/email/capture-email.ts';
export { emailSenderFor, type EmailSettings } from './src/email/email-sender-for.ts';
export { keptEmailAnswer, type KeptEmailAnswer } from './src/email/kept-email-answer.ts';
export {
  keptEmailSender,
  type EmailKept,
  type KeptEmailSenderOptions,
  type NotKeptKind,
} from './src/email/kept-email-sender.ts';
export { isMadeUpAddress, keptAddressOf } from './src/email/made-up-address.ts';
export { resendEmail, type ResendEmailOptions } from './src/email/resend-email.ts';
export * from './src/bot-check/index.ts';
export * from './src/cloudflare/index.ts';
export * from './src/sign-in/index.ts';
export * from './src/live-updates/index.ts';
export * from './src/platform-database/index.ts';
export * from './src/page-cache/index.ts';
