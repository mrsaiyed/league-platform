// Record 075's list of names kept for made-up mail (RFC 2606 and 6761), in one place: the
// web app's kept files and pages, the test copy's kept emails (keptEmailSender) and
// scripts/read-kept-emails.mjs all ask this. Migration 0023 checks the same list again in
// SQL (kept_emails.is_made_up_address), and two tests hold the two to the same answers on
// one shared list of spellings (made-up-address-cases.json): this file's test and
// packages/database/src/schema/kept-emails.test.ts.
//
// The rule, the same on both sides: the address trimmed as JavaScript's trim() trims, at
// most 254 characters, and in the form the sign-in service takes (signInEmail's email
// check in packages/contracts, matched here on the address as typed, so no letter outside
// A to Z can lowercase its way in); then the part after its "@", lowercased, on a kept
// name. Step 2.205's test copy gate asks only this, so an address is made-up only where
// the gate, this function and the SQL rule all say so (the stricter answer of the two
// rules, when step 2.205 met step 2.204).

/**
 * The form an address is kept and looked up in on the test copy, the form the check sees:
 * trimmed, one final dot dropped, A to Z in small letters. The same as migration 0023's
 * kept_emails.kept_form; scripts/read-kept-emails.mjs gives its --to in this form.
 */
export function keptAddressOf(address: string): string {
  return address
    .trim()
    .replace(/\.$/, '')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** signInEmail's longest address. */
const mostLength = 254;

/**
 * The form signInEmail takes (zod 4's email check, the same text as migration 0023's):
 * one "@", a plain name before it, dotted names after it ending in two letters or more.
 */
const addressForm =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/**
 * Whether `address` is on a name kept for made-up mail: `.test`, `.example`, `.invalid`,
 * `.localhost`, or example.com, .net and .org.
 */
export function isMadeUpAddress(address: string): boolean {
  const whole = address.trim();
  if (whole.length > mostLength || !addressForm.test(whole)) return false;
  const name = whole.slice(whole.indexOf('@') + 1).toLowerCase();
  if (['test', 'example', 'invalid', 'localhost'].some((top) => name.endsWith(`.${top}`))) {
    return true;
  }
  return ['example.com', 'example.net', 'example.org'].some(
    (kept) => name === kept || name.endsWith(`.${kept}`),
  );
}
