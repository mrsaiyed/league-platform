// What every template returns, and the small pieces every template shares (T7 §6).
// A template takes data and the words for it, and returns an email; it decides
// nothing about who gets it (that is core's, T2 §2).

/** A rendered email: the subject, the HTML and the plain-text version every template has. */
export type RenderedEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

/**
 * Looks up a message by key (T-187). The apps pass packages/site's translator, whose
 * catalog must hold every key a template names, so a missing key fails the type check.
 */
export type EmailWords<Key extends string> = (
  key: Key,
  params?: Readonly<Record<string, string | number>>,
) => string;

/** Text made safe to put inside HTML, as content or as a quoted attribute. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Characters that could end or bend a header line: every control character (C0,
 * DEL and C1, so \r \n \t \v \f, NUL and U+0085 among them) and the Unicode line and
 * paragraph separators U+2028 and U+2029.
 */
const lineBreaking = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const lineBreakingRuns = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu;

/**
 * Text made safe for one line of an email header, such as the subject: each run of
 * characters that could end the line becomes one space.
 */
export function headerText(text: string): string {
  return text.replace(lineBreakingRuns, ' ').replace(/ {2,}/g, ' ').trim();
}

/**
 * The From header with a display name: `"North League" <hello@example.test>`. The
 * name is the league's own words, so anything that could end the header line is
 * removed (headerText), `<`, `>` and `@` are removed (a mail program could read them
 * as a second address), and quotes and backslashes are escaped. Throws on a sending
 * address that is not one plain address: that is our setting, not the league's, so
 * the worker checks it once at startup.
 */
export function fromHeader(displayName: string, address: string): string {
  if (!isPlainAddress(address)) {
    throw new TypeError('fromHeader: the sending address is not a plain address.');
  }
  const name = headerText(displayName.replace(/[<>@]/g, ' ')).replace(/[\\"]/g, (c) => `\\${c}`);
  return name === '' ? address : `"${name}" <${address}>`;
}

/** One `local@domain`, with nothing that could break the header or hide a second address. */
function isPlainAddress(address: string): boolean {
  if (/[\s<>"(),;:\\[\]]/u.test(address) || lineBreaking.test(address)) return false;
  const at = address.indexOf('@');
  return at > 0 && at === address.lastIndexOf('@') && at < address.length - 1;
}
