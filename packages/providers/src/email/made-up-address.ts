// Record 075's list of names kept for made-up mail (RFC 2606 and 6761), in one place: the
// web app's kept files and pages, the test copy's kept emails (keptEmailSender) and
// scripts/read-kept-emails.mjs all ask this. Migration 0023 checks the same list again in
// SQL (kept_emails.is_made_up_address), and a test holds the two to the same answers.

/**
 * Whether `address` is on a name kept for made-up mail: `.test`, `.example`, `.invalid`,
 * `.localhost`, or example.com, .net and .org.
 */
export function isMadeUpAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(domain)) return false;
  if (['test', 'example', 'invalid', 'localhost'].some((top) => domain.endsWith(`.${top}`))) {
    return true;
  }
  return ['example.com', 'example.net', 'example.org'].some(
    (name) => domain === name || domain.endsWith(`.${name}`),
  );
}
