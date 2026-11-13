// packages/emails: templates that take data and return an email (T2 §2, T7 §6).
// Used only through this file.
export {
  invitationEmail,
  type InvitationEmailData,
  type InvitationEmailKey,
} from './src/invitation-email.ts';
export {
  escapeHtml,
  fromHeader,
  type EmailWords,
  type RenderedEmail,
} from './src/rendered-email.ts';
