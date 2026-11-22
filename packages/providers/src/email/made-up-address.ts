// Record 075's list of names kept for made-up mail (RFC 2606 and 6761), in one place: the
// web app's kept files and pages, the test copy's kept emails (keptEmailSender) and
// scripts/read-kept-emails.mjs all ask this. Migration 0023 checks the same list again in
// SQL (kept_emails.is_made_up_address), and two tests hold the two to the same answers on
// one shared list of spellings (made-up-address-cases.json): this file's test and
// packages/database/src/schema/kept-emails.test.ts.
//
// The rule, the same on both sides: the address trimmed as JavaScript's trim() trims; no
// whitespace left inside it; the part after its last "@", which must not be its first
// character, with one final dot dropped; letters A to Z, digits, dots and hyphens only,
// tested before any lowercasing (so no letter outside A to Z can lowercase its way in).

/**
 * Whether `address` is on a name kept for made-up mail: `.test`, `.example`, `.invalid`,
 * `.localhost`, or example.com, .net and .org.
 */
export function isMadeUpAddress(address: string): boolean {
  const whole = address.trim();
  if (/\s/.test(whole)) return false;
  const at = whole.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = whole.slice(at + 1).replace(/\.$/, '');
  if (!/^[A-Za-z0-9.-]+$/.test(domain)) return false;
  const name = domain.toLowerCase();
  if (['test', 'example', 'invalid', 'localhost'].some((top) => name.endsWith(`.${top}`))) {
    return true;
  }
  return ['example.com', 'example.net', 'example.org'].some(
    (kept) => name === kept || name.endsWith(`.${kept}`),
  );
}
