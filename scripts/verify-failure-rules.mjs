// Works out, from the output of a failed `npm run verify`, what a person needs to know:
// which stage was running when it stopped, the lines naming what failed, and how the
// output ended. Kept apart from scripts/verify-failure-notes.mjs, which reads the file
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
