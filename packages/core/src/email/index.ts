// The email port (T2 §2, T7 §6). Adapters: packages/providers.
export { EmailSendError, type EmailSendErrorCode } from './email-send-error.ts';
export type { EmailMessage, EmailSender, SentEmail } from './ports.ts';
