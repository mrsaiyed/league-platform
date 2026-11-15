// Works out, from the output of a failed `npm run verify`, what a person needs to know:
// which stage was running when it stopped, the lines naming what failed, and how the
// output ended. And the same for the web app's browser tests (`npm run test:web:browser`,
// run test by test by ci.yml): which test file failed, and its failing check's lines. Kept apart from scripts/verify-failure-notes.mjs, which reads the file
// and prints, so it can be tested by itself (tests/verify-failure-notes.test.mjs).
//
// The notes are GitHub annotations (`::error title=…::…`), which GitHub shows on the run
// and gives to scripts/github-check.mjs. GitHub keeps at most ten error annotations per
// step, so there are never more than nine.

const MOST_FAILURES = 7;
const LAST_LINES = 15;
const LONGEST = 300;

/** The output as plain lines: colour codes gone, and of a line redrawn in place, its last state. */
export function plainLines(output) {
  return output
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\n/)
    .map((line) => line.split('\r').filter(Boolean).pop() ?? '')
    .map((line) => line.trimEnd());
}

const failureLine = [
  /\bFAIL\b/,
  /^\s*×/,
  /Test timed out/,
  /Hook timed out/,
  /^\s*not ok\b/,
  /^\s*✖/,
  /^\s*(Test Files|Tests)\s.*\bfailed\b/,
  // The repository's own checks ("Web shell check failed:", "Structure checks failed …").
  /\bchecks? failed\b/,
  // Node refusing a TypeScript file it runs itself (step 2.149), and the rule naming it.
  /not supported in strip-only mode/,
  /\[NODE-TS\]/,
];

/** The annotations, as lines for GitHub to read. */
export function failureNotes(output) {
  const lines = plainLines(output);
  const notes = [];

  // npm prints "> league-platform@0.1.0 test:units" before each script it runs.
  const stages = lines.filter((line) => /^> \S+@\S+ \S+/.test(line));
  const stage = stages.at(-1);
  notes.push(
    annotation(
      stage ? `verify stopped during ${stage.split(' ')[2]}` : 'verify stopped',
      stage ?? 'npm printed no stage before it stopped.',
    ),
  );

  const named = [];
  const errors = [];
  lines.forEach((line, i) => {
    if (failureLine.some((pattern) => pattern.test(line))) named.push(line.trim());
    else if (/\bError:/.test(line)) errors.push(`${line.trim()} | ${(lines[i + 1] ?? '').trim()}`);
  });
  const failures = [...new Set([...named, ...errors])];
  const shown = failures.slice(0, MOST_FAILURES);
  if (failures.length > shown.length) {
    shown[shown.length - 1] =
      `${failures.length - shown.length + 1} more lines name failures; see the log.`;
  }
  for (const line of shown) notes.push(annotation('failed', line));

  const tail = lines.filter((line) => line.trim() !== '').slice(-LAST_LINES);
  notes.push(annotation(`the last ${tail.length} lines`, tail.join('\n')));
  return notes;
}

/**
 * The tests of a chain in package.json (`node a.mjs && node b.mjs --no-build`), one
 * command each, in order, so ci.yml can run each under its own heading. Anything but
 * `node <file>.mjs [--flags]` joined by `&&` is refused, so the chain is never run
 * otherwise than package.json says.
 */
export function chainSteps(script) {
  const steps = String(script ?? '').split(' && ');
  for (const step of steps) {
    if (!/^node [\w./-]+\.mjs(?: --[\w-]+)*$/.test(step)) {
      throw new Error(`not a chain of node tests joined by &&: "${step}"`);
    }
  }
  return steps;
}

/** The heading ci.yml prints before each test of the web app's browser chain. */
const stepHeading = /^::group::(.+)$/;

/**
 * The annotations for a failed run of the web app's browser tests, as ci.yml runs them:
 * each test of the chain under a `::group::<command>` heading, all output kept. They name
 * the test file that failed (the last one started) and give its failing check's lines (the
 * lines under its "… failed:" heading, and errors) and the last lines of its own output.
 */
export function browserFailureNotes(output) {
  const lines = plainLines(output);
  const starts = lines.flatMap((line, i) => (stepHeading.test(line) ? [i] : []));
  if (starts.length === 0) {
    const tail = lines.filter((line) => line.trim() !== '').slice(-LAST_LINES);
    return [
      annotation('web browser tests stopped', 'No browser test had started.'),
      annotation(`the last ${tail.length} lines`, tail.join('\n')),
    ];
  }
  const start = starts.at(-1);
  const command = stepHeading.exec(lines[start])?.[1] ?? '';
  const file = /\S+\.mjs/.exec(command)?.[0] ?? command;
  const own = lines.slice(start + 1).filter((line) => line !== '::endgroup::');
  const notes = [annotation(`web browser test failed: ${file}`, command)];

  const failures = [];
  let underHeading = false;
  own.forEach((line, i) => {
    if (/\b(?:check|test) failed:\s*$/.test(line)) {
      underHeading = true;
      failures.push(line.trim());
    } else if (underHeading && /^\s+\S|^- /.test(line)) {
      failures.push(line.trim());
    } else {
      underHeading = false;
      if (failureLine.some((pattern) => pattern.test(line))) failures.push(line.trim());
      else if (/\bError:/.test(line))
        failures.push(`${line.trim()} | ${(own[i + 1] ?? '').trim()}`);
    }
  });
  const unique = [...new Set(failures)];
  const shown = unique.slice(0, MOST_FAILURES);
  if (unique.length > shown.length) {
    shown[shown.length - 1] =
      `${unique.length - shown.length + 1} more lines name failures; see the log.`;
  }
  for (const line of shown) notes.push(annotation('failed', line));

  const tail = own.filter((line) => line.trim() !== '').slice(-LAST_LINES);
  notes.push(annotation(`the last ${tail.length} lines of ${file}`, tail.join('\n')));
  return notes;
}

function annotation(title, message) {
  const cut = message
    .split('\n')
    .map((line) => (line.length > LONGEST ? `${line.slice(0, LONGEST)}…` : line))
    .join('\n');
  return `::error title=${escapeProperty(title)}::${escapeData(cut)}`;
}

// GitHub's own escaping for workflow commands.
const escapeData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
