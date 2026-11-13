// The sign-in emails (T4 §3): the 6-digit code (T-67), the new-device notice (T-70)
// and the password-changed notice (T-85). They are sent by our own email service,
// not the sign-in vendor's. Which email goes to whom is decided by the app; these
// only draw them. Plain HTML, like the invitation email.
import { escapeHtml, headerText, type EmailWords, type RenderedEmail } from './rendered-email.ts';

export type SignInEmailKey =
  | 'email.signInCode.subjectSignUp'
  | 'email.signInCode.subjectReset'
  | 'email.signInCode.code'
  | 'email.signInCode.existing'
  | 'email.signInCode.notExpected'
  | 'email.newDevice.subject'
  | 'email.newDevice.body'
  | 'email.newDevice.notYou'
  | 'email.passwordChanged.subject'
  | 'email.passwordChanged.body'
  | 'email.passwordChanged.notYou'
  | 'site.poweredBy';

export type SignInCodeEmailData = {
  readonly purpose: 'sign-up' | 'reset';
  readonly code: string;
  readonly validMinutes: number;
  /** Told only to the mailbox: "you already have an account" (T-68). */
  readonly accountExists: boolean;
  readonly siteUrl: string;
};

export type NewDeviceEmailData = {
  /** "Firefox on Windows". */
  readonly deviceLabel: string;
  /** The time, already in words. */
  readonly when: string;
  /** The account page, where "sign out everywhere" is. */
  readonly accountUrl: string;
  readonly siteUrl: string;
};

export type PasswordChangedEmailData = {
  readonly when: string;
  /** The forgotten-password page. */
  readonly resetUrl: string;
  readonly siteUrl: string;
};

type Words = EmailWords<SignInEmailKey>;

export function signInCodeEmail(data: SignInCodeEmailData, t: Words): RenderedEmail {
  const subject = t(
    data.purpose === 'sign-up' ? 'email.signInCode.subjectSignUp' : 'email.signInCode.subjectReset',
  );
  const lines = [t('email.signInCode.code', { code: data.code, minutes: data.validMinutes })];
  if (data.accountExists && data.purpose === 'sign-up') lines.push(t('email.signInCode.existing'));
  lines.push(t('email.signInCode.notExpected'));
  return render(subject, lines, null, data.siteUrl, t);
}

export function newDeviceEmail(data: NewDeviceEmailData, t: Words): RenderedEmail {
  return render(
    t('email.newDevice.subject'),
    [
      t('email.newDevice.body', { device: data.deviceLabel, when: data.when }),
      t('email.newDevice.notYou'),
    ],
    data.accountUrl,
    data.siteUrl,
    t,
  );
}

export function passwordChangedEmail(data: PasswordChangedEmailData, t: Words): RenderedEmail {
  return render(
    t('email.passwordChanged.subject'),
    [t('email.passwordChanged.body', { when: data.when }), t('email.passwordChanged.notYou')],
    data.resetUrl,
    data.siteUrl,
    t,
  );
}

/** Paragraphs, then a link of ours if any, then the "Powered by" mark. */
function render(
  subjectWords: string,
  lines: readonly string[],
  link: string | null,
  siteUrl: string,
  t: Words,
): RenderedEmail {
  const subject = headerText(subjectWords);
  const poweredBy = t('site.poweredBy');
  const paragraph = (text: string) =>
    `<p style="font-size:16px;line-height:1.5">${escapeHtml(text)}</p>`;
  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    `<title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f2328;background:#ffffff">',
    ...lines.map(paragraph),
    ...(link === null ? [] : [`<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`]),
    `<p style="font-size:12px;color:#59636e"><a href="${escapeHtml(siteUrl)}" style="color:#59636e">${escapeHtml(poweredBy)}</a></p>`,
    '</body></html>',
  ].join('\n');
  const text = [
    ...lines.flatMap((line) => [line, '']),
    ...(link === null ? [] : [link, '']),
    '--',
    `${poweredBy}: ${siteUrl}`,
    '',
  ].join('\n');
  return { subject, html, text };
}
