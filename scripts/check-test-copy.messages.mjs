// The words of scripts/check-test-copy.mjs (step 2.207): how to use it, why it refuses an
// address, the line for each check and what was seen (T-187). It holds no secret and asks
// for none, so nothing here can repeat one: what is seen is a status, a header's value, a
// count or a short fixed phrase, never a page's text.

export const usage = [
  'Reads the test copy at one address, changes nothing, and says line by line whether it',
  'answers as the test copy must (step 2.207): its health answer asks the database; every',
  'page and robots.txt say “do not index”; the local-only pages and the “be this person”',
  'action answer exactly as an address that does not exist; the test-copy line is shown.',
  '',
  'node scripts/check-test-copy.mjs <address> [--action-id <id> | --manifest <file>] [--league <short name>]',
  '',
  '<address>      https://<the test copy’s host>, or http://localhost:<port> or',
  '               http://127.0.0.1:<port> for a copy on this computer. Nothing after it.',
  '--action-id    the “be this person” action’s id in the build being checked: in that',
  '               build’s apps/web/.next/server/server-reference-manifest.json, the entry',
  '               whose exportedName is beMadeUpPersonAction. A new id is made at every',
  '               build, so without it that one line cannot be checked and fails.',
  '--manifest     that file itself, when the build is on this computer.',
  '--league       a made-up league’s short name to read (by default one no copy has).',
  '',
  'It needs no key and reads none. It sends GET requests, and one POST of the “be this',
  'person” form, for a person no copy has, to each of two addresses: on a right copy both',
  'answer “not found”. It follows no redirect to another host and waits at most 10 seconds',
  'for each answer. Exit code 0 when every check passed, 1 when one failed, 2 when it refused.',
];

export const addressMissing = 'Give the address of the copy to check, once.';
export const addressForm =
  'The address must be https://<host>, or plain http only for this computer (http://localhost:<port> or http://127.0.0.1:<port>), with nothing after it: no path, login, query or fragment. Nothing was asked.';
export const actionIdForm =
  '--action-id must be the action’s id as the build’s manifest writes it: letters a to f and digits only. Nothing was asked.';
export const bothGiven = 'Give --action-id or --manifest, not both. Nothing was asked.';
export const manifestUnread =
  '--manifest: the file could not be read as a build’s server-reference-manifest.json, or holds no beMadeUpPersonAction. Nothing was asked.';
export const leagueForm =
  '--league must be a league’s short name as its address writes it. Nothing was asked.';

export const title = 'The test copy check (step 2.207)';
export const where = (origin) => `Where: ${origin}`;
export const aboutTheRun = [
  'It reads pages and changes nothing; it holds no key. Each line says passed or FAILED,',
  'and what was seen.',
];

/** Each check's line, in the order they run. */
export const checks = {
  health: 'The health answer is 200 and says it asked the database',
  frontPage: 'The front page says “do not index” (its header and its own mark)',
  signIn: 'The sign-in page says “do not index” (its header and its own mark)',
  league: 'A made-up league’s address says “do not index” (its header and its own mark)',
  missing: 'A page that does not exist says “do not index” (its header and its own mark)',
  robots: 'robots.txt asks every robot to keep out of the whole site, and says “do not index”',
  keptEmails: 'GET /signin/kept-emails answers exactly as /signin/no-such-page',
  madeUpPeople: 'GET /signin/made-up-people answers exactly as /signin/no-such-page',
  beThisPerson:
    'The posted “be this person” form answers at /signin/made-up-people exactly as at /signin/no-such-page',
  testCopyLine: 'The test-copy line is on the front page and the sign-in page',
};

export const passed = 'passed';
export const failed = 'FAILED';
export const line = (verdict, label, seen) =>
  seen === undefined ? `  ${verdict.padEnd(8)}${label}` : `  ${verdict.padEnd(8)}${label}: ${seen}`;

// What was seen, in a few words.
export const healthSeen = (status, database) =>
  `status ${status}, database ${database === undefined ? 'not said' : `“${database}”`}`;
export const pageSeen = (status, header, mark) =>
  `status ${status}, header ${header === null ? 'none' : `“${header}”`}, ${mark ? 'its mark there' : 'no mark'}`;
export const robotsSeen = (status, keepsOut, header) =>
  `status ${status}, ${keepsOut ? 'keeps every robot out' : 'does not keep every robot out'}, header ${header === null ? 'none' : `“${header}”`}`;
export const sameSeen = (status) => `both answered ${status}, the same`;
export const statusDiffers = (one, other) => `status ${one} / ${other}`;
export const bodyDiffers = (at, one, other) =>
  `the body differs from character ${at} (${one} / ${other} characters)`;
export const lineSeen = (where) => `missing on ${where.join(' and ')}`;
export const pageNames = { frontPage: 'the front page', signIn: 'the sign-in page' };
export const noActionId =
  'not checked: give --action-id or --manifest for the build being checked (node scripts/check-test-copy.mjs --help)';
export const noAnswerInTime = 'no answer within 10 seconds';
export const noConnection = 'could not reach the address';
export const otherHost = 'redirected to another host (not followed)';
export const tooManyRedirects = 'redirected more than 5 times';
export const notReadable = 'answered in a shape this check does not read';

export const allPassed = (count) => `All ${count} checks passed.`;
export const someFailed = (count, total) => `${count} of ${total} checks FAILED:`;
export const failedItem = (label) => `  - ${label}`;
