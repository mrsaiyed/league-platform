// The words of `node scripts/read-kept-emails.mjs` (step 2.204). None repeats an address,
// a code or a link: the script prints those only as its one answer.
export const usage =
  'Use: node scripts/read-kept-emails.mjs --hosted --to <made-up address>. It prints the newest code or link sent to that address on the test copy.';
export const toMissing = '--to is missing: give the made-up address the email was sent to.';
export const toNotMadeUp =
  '--to is not a made-up address (record 075: .test, .example, .invalid, .localhost, example.com, .net or .org). Only those are ever kept. Nothing was opened.';
export const noneKept =
  'No email is kept for that address. Ask for the code again, then run this again. If it still finds none, see docs/operations/reading-test-copy-codes.md.';
export const nothingToRead =
  'The newest email kept for that address has no code and no link in it (a notice, perhaps).';
export const notYetMigrated =
  'This database has no kept emails yet (migration 0023 has not been applied). Nothing was read.';
export const unexpected = (code) =>
  code === undefined
    ? 'Something went wrong while reading. Nothing was changed.'
    : `Something went wrong while reading (${code}). Nothing was changed.`;
