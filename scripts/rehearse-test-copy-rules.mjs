// The pure rules of `npm run rehearse:test-copy` (step 2.207, T-301): which line of the
// procedure a step is, an address without its password, the next answer due at a tool's
// question, the code the kept-emails script printed, and what a run left in git's view.
// Tested in tests/rehearse-test-copy-rules.test.mjs.

/** The page's own steps, by the heading the rehearsal looks for in it. */
export const pageSteps = {
  database: { step: 'before 1', heading: '# Setting up a new test copy' },
  project: { step: '1', heading: '## 1. Check it is the right project' },
  confirmEmail: { step: '2', heading: '## 2. Turn "Confirm email" on' },
  release: { step: '3', heading: '## 3. Apply the database changes' },
  releaseAgain: { step: '3', heading: '## 3. Apply the database changes' },
  login: { step: '4.2', heading: '## 4. Make the website’s own login, `app_login`' },
  password: { step: '4.3', heading: '## 4. Make the website’s own login, `app_login`' },
  signInStore: { step: '5', heading: '## 5. Give it the sign-in store, once' },
  realChecks: { step: '6', heading: '## 6. The checks on the real database' },
  build: { step: '7', heading: '## 7. Start the website on Render' },
  start: { step: '7', heading: '## 7. Start the website on Render' },
  health: { step: '8.1.1', heading: '## 8. The first checks on the copy' },
  league: { step: '8.1.2', heading: '## 8. The first checks on the copy' },
  signUp: { step: '8.1.2', heading: '## 8. The first checks on the copy' },
  walk: { step: '8.1.3 to 8.1.5', heading: '## 8. The first checks on the copy' },
  checkCopy: { step: '8.2 and 8.3', heading: '## 8. The first checks on the copy' },
};

/**
 * The two failures the rehearsal can be asked to see (`--expect-refusal=<kind>`): what is
 * taken out, and the website's own sentence when it refuses to start (startup.ts).
 */
export const refusals = {
  certificate: {
    setting: 'PLATFORM_DATABASE_CA taken out of the website’s settings',
    sentence:
      /The web app cannot start: the database’s certificate was not accepted.*?start the app again\./,
  },
  'confirm-email': {
    setting: 'the sign-in service saying "Confirm email" is off',
    sentence:
      /The web app cannot start: the sign-in service does not confirm email addresses.*?start the app again\./,
  },
};

/** The website's refusal sentence of that kind in what it printed (a log line's \" read as "), or null. */
export function refusalIn(output, kind) {
  const found = refusals[kind].sentence.exec(output.replace(/\\"/g, '"'));
  return found === null ? null : found[0];
}

/**
 * Where a step is in the page: its number, its heading without the #s, and the line the
 * heading is on (0 when the page no longer has it, which is itself a fault to cure).
 */
export function whereInPage(pageText, id) {
  const { step, heading } = pageSteps[id];
  // The page writes the apostrophe both ways; either counts.
  const wanted = heading.replace(/[’']/g, "'");
  const index = pageText.split('\n').findIndex((l) => l.replace(/[’']/g, "'") === wanted);
  return { step, heading: heading.replace(/^#+ /, ''), line: index + 1 };
}

/** A postgres address split into the address without password or query, and the password. */
export function splitAddress(address) {
  const url = new URL(address);
  const password = decodeURIComponent(url.password);
  url.password = '';
  url.search = '';
  return { address: url.toString(), password, user: decodeURIComponent(url.username) };
}

/** The same address with another login and password (letters and digits only). */
export function addressAs(address, user, password) {
  const url = new URL(address);
  url.username = user;
  url.password = password;
  url.search = '';
  return url.toString();
}

/**
 * The next answer to type, or null. `answers` is the list of { after, send } in order,
 * `given` how many were typed already, `text` what the tool printed since the last one
 * was typed: the next is due once its `after` pattern is in that text.
 */
export function answerDue(text, answers, given) {
  const next = answers[given];
  if (next === undefined) return null;
  // A line reader at a terminal moves the cursor around its question: those moves are not text.
  // eslint-disable-next-line no-control-regex
  return next.after.test(text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')) ? next : null;
}

/** The code the kept-emails script printed: its one line of six digits, else null. */
export function codeIn(output) {
  const lines = output
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim());
  const codes = lines.filter((l) => /^\d{6}$/.test(l));
  return codes.length === 1 ? codes[0] : null;
}

/** The text with every given secret replaced, for printing a tool's output on failure. */
export function hidden(text, secrets) {
  let shown = text;
  for (const secret of secrets) if (secret) shown = shown.split(secret).join('[hidden]');
  return shown;
}

/** Lines of `git status --porcelain` there after the run and not before it. */
export function leftBehind(before, after) {
  const was = new Set(before.split('\n').filter(Boolean));
  return after
    .split('\n')
    .filter(Boolean)
    .filter((l) => !was.has(l))
    .map((l) => l.slice(3));
}
