// Works out, from the output of a failed `npm run test:web:browser`, what a person needs to
// know: which test file of the chain stopped, the checks it said failed, the errors a build
// or a server printed, how the output ended, and what the machine was. Kept apart from
// scripts/browser-failure-notes.mjs, which reads the file, asks the machine and prints, so
// it can be tested by itself (tests/browser-failure-notes.test.mjs).
//
// The output is read as ci.yml makes it: bash runs the chain with its trace on, so it
// prints "+ node tests/browser/<file>.mjs" before it starts each test; every test prints
// "<its name> … failed:" and one indented line per failing check; and a test that fails
// prints the last lines of any Next.js build or server that did not finish well
// ("The last 30 lines `next build` printed (…):", each line after it starting "  | ").
// The notes are GitHub annotations: never more than nine (GitHub keeps ten per step).
import { annotation, plainLines } from './verify-failure-rules.mjs';

const MOST_FAILURES = 6;
const LAST_LINES = 30;

// Lines from a build or a server, or from Node itself, that say what went wrong.
const errorLine = [
  /Failed to compile/,
  /Module not found/,
  /Type error:/,
  /\b[A-Z]\w*Error\b/,
  /\bError:/,
  /\bERR_[A-Z_]+/,
  /Timeout \d+ms exceeded/,
  /heap out of memory/,
  /\bKilled\b/,
  /\bE(NOSPC|NOMEM|ADDRINUSE|ACCES)\b/,
  /not supported in strip-only mode/,
];

/** The annotations, as lines for GitHub to read. `machine` is a list of [what, value]. */
export function browserFailureNotes(output, machine = []) {
  const lines = plainLines(output);
  const notes = [];

  // The last test bash started is the one that stopped the chain.
  let started = -1;
  lines.forEach((line, i) => {
    if (/^\++ node tests\/browser\/\S+/.test(line)) started = i;
  });
  const own = started >= 0 ? lines.slice(started + 1) : lines;
  const file = started >= 0 ? lines[started].split(' ')[2] : '';
  const heading = own.find((line) => /\bfailed:\s*$/.test(line));
  notes.push(
    annotation(
      file ? `browser tests stopped in ${file}` : 'browser tests stopped',
      [
        file ? lines[started].replace(/^\++ /, '') : 'bash named no test file before it stopped.',
        heading ?? 'It printed no list of failed checks: see its last lines.',
      ].join('\n'),
    ),
  );

  // The failing checks: the indented lines under the heading.
  const checks = [];
  const listed = new Set();
  if (heading) {
    for (let i = own.indexOf(heading) + 1; i < own.length; i += 1) {
      if (!/^(\s+|- )\S/.test(own[i]) || /^\s*\|/.test(own[i])) break;
      listed.add(i);
      checks.push(own[i].trim().replace(/^- /, ''));
    }
  }
  // Other lines that name an error, a build's or a server's among them; not the checks again.
  const errors = own
    .filter((line, i) => !listed.has(i) && errorLine.some((pattern) => pattern.test(line)))
    .map((line) => line.replace(/^\s*\|\s?/, '').trim());
  const failures = [
    ...checks.map((line) => ['failed check', line]),
    ...[...new Set(errors)].map((line) => ['printed', line]),
  ];
  const shown = failures.slice(0, MOST_FAILURES);
  if (failures.length > shown.length) {
    shown[shown.length - 1] = [
      'more',
      `${failures.length - shown.length + 1} more failing checks or errors; see the last lines.`,
    ];
  }
  for (const [title, line] of shown) notes.push(annotation(title, line));

  const said = own.some((line) => line.trim() !== '') ? own : lines;
  const tail = said.filter((line) => line.trim() !== '').slice(-LAST_LINES);
  notes.push(annotation(`the last ${tail.length} lines`, tail.join('\n') || '(nothing)'));

  if (machine.length > 0) {
    notes.push(
      annotation('the machine', machine.map(([what, value]) => `${what}: ${value}`).join('\n')),
    );
  }
  return notes;
}
