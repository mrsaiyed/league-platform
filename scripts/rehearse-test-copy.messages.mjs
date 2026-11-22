// The words of `npm run rehearse:test-copy` (step 2.207, T-301): what it says at each step
// of docs/operations/new-test-copy.md as it follows it on this computer, and how it fails.
// Kept here, as release.messages.mjs keeps the release command's (T-187).

export const page = 'docs/operations/new-test-copy.md';

export const opening = [
  'Rehearsing the new test copy procedure (docs/operations/new-test-copy.md) on this computer.',
  'Made-up data only: a throw-away PostgreSQL with a certificate (step 2.202), the sign-in fake',
  '(step 2.93) in place of Supabase’s sign-in service, the website in staging mode. Nothing here',
  'reaches another computer or a real service. Every password is made up and made just now.',
].join('\n');

/** One line per step of the page, said before it is done. */
export const doing = {
  database: 'Before the page: a new, empty database, as a new Supabase project is.',
  project: 'Step 1: checking it is not the tracker’s project.',
  confirmEmail: 'Step 2: the sign-in service, with "Confirm email" on.',
  release: 'Step 3: applying the database changes with the release command, as its owner.',
  releaseAgain: 'Step 3: the release command again; it must apply nothing.',
  login: 'Step 4: making the website’s own login, app_login, without a password.',
  password: 'Step 4: giving app_login its password at the terminal, with psql’s \\password.',
  signInStore: 'Step 5: giving app_login the sign-in store.',
  realChecks: 'Step 6: the checks on the real database need a league; they come after step 8.1.',
  build: 'Step 7: building the website (this takes a few minutes).',
  start: 'Step 7: starting the website in staging mode with exactly the settings the page lists.',
  health: 'Step 8.1.1: the health address, before any league exists.',
  league: 'Step 8.1.2: making a league with npm run league:make, as the page links to.',
  signUp:
    'Step 8.1.2: its owner signs up in a browser, with the code read by the kept-emails script.',
  walk: 'Steps 8.1.3 to 8.1.5: the first test’s walk (step 2.194) to the final table, a second browser watching signed out.',
  checkCopy:
    'Steps 8.2 and 8.3: npm run check:test-copy against the rehearsed site, with the build’s manifest.',
};

export const walked = (checks) =>
  `the walk, steps 1 to 18, ${checks} checks passed: the owner signed in on the sign-in page and scored game 1 to the final table; the league is a draft, so the owner read steps 16 to 18 and the visitor, signed out in a browser of its own, saw each of those pages hidden (404)`;

export const refusedHere = (sentence) => `  refused, as asked: “${sentence}”`;
export const refusedPassed = (setting, sentence) =>
  [
    `PASSED: with ${setting}, the website refused to start, in its own words:`,
    `  “${sentence}”`,
    'That is the expected result; nothing after the start was rehearsed.',
  ].join('\n');

export const done = (detail) => `  done: ${detail}`;

export const failed = ({ step, line, heading, reason }) =>
  [
    `FAILED at step ${step} of the procedure ("${heading}", line ${line} of ${page}):`,
    `  ${reason}`,
    'Nothing further was done.',
  ].join('\n');

export const outputTail = 'What the tool last printed (passwords hidden):';

export const stopping =
  'Stopping what the rehearsal started: the website, the sign-in fake, the database.';
export const stoppedClean = 'Stopped. No file the rehearsal made is left in git’s view.';
export const leftInGit = (paths) =>
  `FAILED: the rehearsal left these in git’s view: ${paths.join(', ')}.`;

export const passed = [
  'PASSED: the procedure was followed on this computer through its steps 8.1 to 8.3: the owner',
  'signed up, the first test’s walk reached the final table with a visitor watching signed out,',
  'and the test copy check passed every line. Left for the supervised session: step 6’s checks,',
  'steps 8.4 and 8.5, and what a rehearsal cannot show (the page’s list at its top).',
].join('\n');

export const reasons = {
  noBuild: 'the website could not be built (node scripts/web.mjs build failed).',
  tracker: 'the database address names the tracker’s project (supabase/site.json).',
  envFile:
    'this checkout has a .env file; the rehearsal does not run beside one, since the tools would read it.',
  toolFailed: (tool, code) => `${tool} ended with exit code ${code}.`,
  toolTimedOut: (tool, waiting) =>
    `${tool} did not answer in time; it was waiting for: ${waiting}.`,
  notSeen: (what) => `the page says to see ${what}, and it was not there.`,
  notReady: (why) => `the website did not start: ${why}`,
  health: (status, body) => `the health address answered ${status}: ${body}`,
  noCode: 'the kept-emails script printed no 6-digit code.',
  notOwner: (status) => `the owner could not open the league’s admin area (it answered ${status}).`,
  unknownRefusal: (kinds) =>
    `--expect-refusal takes one of: ${kinds.join(', ')}. Nothing was started.`,
  notRefused: (setting) =>
    `with ${setting}, the website was expected to refuse to start, and it did not.`,
  walkStopped: (at, why) => `the walk stopped at ${at}: ${why}`,
  walkChecks: (count, total) =>
    `${count} of the walk’s ${total} checks did not answer as first-test.md says (listed below).`,
};
