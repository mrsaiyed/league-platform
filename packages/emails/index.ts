// packages/emails: templates that take data and return an email (T2 §2, T7 §6).
// Used only through this file.
export {
  invitationEmail,
  type InvitationEmailData,
  type InvitationEmailKey,
} from './src/invitation-email.ts';
export {
  newDeviceEmail,
  passwordChangedEmail,
  signInCodeEmail,
  type NewDeviceEmailData,
  type PasswordChangedEmailData,
  type SignInCodeEmailData,
  type SignInEmailKey,
} from './src/sign-in-emails.ts';
export {
  escapeHtml,
  fromHeader,
  headerText,
  type EmailWords,
  type RenderedEmail,
} from './src/rendered-email.ts';
