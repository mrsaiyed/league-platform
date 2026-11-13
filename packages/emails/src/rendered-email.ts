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
 * The From header with a display name: `"North League" <hello@example.test>`. The
 * name is the league's own words, so line breaks are removed (they would start a new
 * header) and quotes and backslashes are escaped.
 */
export function fromHeader(displayName: string, address: string): string {
  if (/[\r\n<>"\s]/.test(address) || !address.includes('@')) {
    throw new TypeError('fromHeader: the sending address is not a plain address.');
  }
  const name = displayName
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\"]/g, (c) => `\\${c}`)
    .trim();
  return name === '' ? address : `"${name}" <${address}>`;
}
