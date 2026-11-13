// The invitation email (P4 §4, T-226): someone was invited to help run a league. It
// carries the link that accepts the invitation; the link is made as the email is
// sent (the worker's email.send job) and exists nowhere else, so nothing here keeps
// or logs it. Plain HTML for now; the league's logo and colors (T7 §6) come when
// templates are drawn with the league's design.
import { escapeHtml, type EmailWords, type RenderedEmail } from './rendered-email.ts';

/** The message keys this template uses (packages/site's English catalog has each). */
export type InvitationEmailKey =
  | 'email.invitation.subject'
  | 'email.invitation.intro'
  | 'email.invitation.action'
  | 'email.invitation.howTo'
  | 'email.invitation.expiry'
  | 'email.invitation.notExpected'
  | 'email.invitation.linkFallback'
  | 'site.poweredBy';

export type InvitationEmailData = {
  /** The league's name, as its admin wrote it. */
  readonly leagueName: string;
  /** The role's name, already in words ("Editor"). */
  readonly roleName: string;
  /** The full address that accepts the invitation. */
  readonly acceptUrl: string;
  /** How many days a link works after the invitation is sent. */
  readonly lifetimeDays: number;
  /** Our front page, which the "Powered by" mark links to (P2 §6). */
  readonly siteUrl: string;
};

export function invitationEmail(
  data: InvitationEmailData,
  t: EmailWords<InvitationEmailKey>,
): RenderedEmail {
  const subject = t('email.invitation.subject', { league: data.leagueName });
  const intro = t('email.invitation.intro', { league: data.leagueName, role: data.roleName });
  const action = t('email.invitation.action');
  const howTo = t('email.invitation.howTo');
  const expiry = t('email.invitation.expiry', { days: data.lifetimeDays });
  const notExpected = t('email.invitation.notExpected');
  const fallback = t('email.invitation.linkFallback');
  const poweredBy = t('site.poweredBy');

  const url = escapeHtml(data.acceptUrl);
  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    `<title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f2328;background:#ffffff">',
    `<p style="font-size:16px;line-height:1.5">${escapeHtml(intro)}</p>`,
    `<p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#1f2328;color:#ffffff;text-decoration:none;font-weight:bold">${escapeHtml(action)}</a></p>`,
    `<p style="font-size:14px;line-height:1.5">${escapeHtml(howTo)} ${escapeHtml(expiry)}</p>`,
    `<p style="font-size:14px;line-height:1.5">${escapeHtml(fallback)}<br><a href="${url}">${url}</a></p>`,
    `<p style="font-size:14px;line-height:1.5">${escapeHtml(notExpected)}</p>`,
    `<p style="font-size:12px;color:#59636e"><a href="${escapeHtml(data.siteUrl)}" style="color:#59636e">${escapeHtml(poweredBy)}</a></p>`,
    '</body></html>',
  ].join('\n');

  const text = [
    intro,
    '',
    `${action}: ${data.acceptUrl}`,
    '',
    `${howTo} ${expiry}`,
    '',
    notExpected,
    '',
    '--',
    `${poweredBy}: ${data.siteUrl}`,
    '',
  ].join('\n');

  return { subject, html, text };
}
