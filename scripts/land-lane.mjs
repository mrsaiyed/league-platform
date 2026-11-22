#!/usr/bin/env node
// Lands one lane on the build branch with one command, so the lead does not spend eight
// (docs/build/USAGE.md, rule 13). It only does what the runbook's landing says, in order,
// and stops at the first thing that is not as it should be:
//
//   node scripts/land-lane.mjs lane/2.50-people-screens --step 2.50 \
//     --title "the People screens" --log "Step 2.50 landed (...): ..." \
//     [--part "PART 1 LANDED ..."] [--polish "one line"] [--tests "path path"] \
//     [--twin lane/2.50-again] [--replace-agreed U-15] [--keep-folder] [--dry-run]
//
// NEVER land a lane while a helper is still working in its folder: step 6 removes the folder,
// git-ignored files and all (it took a reader's pictures with it on 2026-11-22). If someone
// is in it, wait for their report, or pass --keep-folder and remove the folder afterwards.
//
// 1. the main folder is on the build branch with nothing uncommitted;
// 2. GitHub has PASSED the lane's newest commit on the lane AND on its twin;
// 3. the merge has no conflict (else: merge the build branch into the lane first);
// 4. merge (--no-ff), fold the lane's pending decisions, tick the plan line (or, with
//    --part, note the part on it and leave it open), drop the lane's row from STATUS.md
//    (with --part the row stays: the lead rewrites it), add the LOG entry and a polish line;
// 5. the structure check, the format check, the pending-decisions test, the type check and
//    the test files named with --tests; if one fails the merge is undone (nothing was pushed);
// 6. commit the log, push the build branch, remove the lane's folder and local branch.
//
// The two lines every commit message ends with are read from .local/commit-trailer.txt
// (git-ignored), which the lead writes once per session.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const lane = args[0];
const opt = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const dryRun = args.includes('--dry-run');
const stop = (why) => {
  console.error(`NOT LANDED: ${why}`);
  process.exit(1);
};
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const run = (cmd, a, quiet = true) => {
  const r = spawnSync(cmd, a, { cwd: root, encoding: 'utf8', shell: false });
  if (r.status !== 0 && !quiet)
    console.error(`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n'));
  return r;
};

const step = opt('step');
const title = opt('title');
const log = opt('log');
if (!lane?.startsWith('lane/') || !step || !title || !log) {
  stop('usage: land-lane.mjs lane/<name> --step <2.x> --title "<words>" --log "<log line>"');
}
const twin = opt('twin') ?? `lane/${lane.slice(5).split('-')[0]}-again`;
const trailerFile = `${root}.local/commit-trailer.txt`;
if (!existsSync(trailerFile))
  stop('.local/commit-trailer.txt is missing (the two closing lines of a commit message)');
const trailer = readFileSync(trailerFile, 'utf8').trim();

// 1. Where we are.
const build = readFileSync(`${root}docs/build/STATUS.md`, 'utf8').match(
  /\*\*Branch:\*\* `([^`]+)`/,
)?.[1];
if (!build) stop('STATUS.md does not name the build branch');
if (git('branch', '--show-current') !== build) stop(`the main folder is not on ${build}`);
if (git('status', '--porcelain') !== '') stop('the main folder has uncommitted changes');
const head = git('rev-parse', '--short=7', lane);

// 2. GitHub passed this commit twice.
for (const branch of [lane, twin]) {
  const said = run('node', ['scripts/github-check.mjs', branch]).stdout.split('\n')[0] ?? '';
  if (!said.includes(`PASSED on ${head}`))
    stop(`GitHub has not passed ${head} on ${branch}: ${said.trim()}`);
}

// 3. No conflict.
const tree = run('git', ['merge-tree', '--write-tree', '--name-only', build, lane]);
if (tree.status !== 0) {
  const files = tree.stdout
    .split('\n')
    .filter((l) => l.startsWith('CONFLICT'))
    .join('; ');
  stop(
    `the merge conflicts (${files}). Merge ${build} into the lane, push it twice, and wait for GitHub.`,
  );
}
if (dryRun) {
  console.log(`Would land ${lane} (${head}); twin ${twin}; GitHub passed both; no conflict.`);
  process.exit(0);
}

// 4. Merge, fold, write down.
const before = git('rev-parse', 'HEAD');
const undo = (why) => {
  git('reset', '-q', '--hard', before);
  stop(`${why}. The merge was undone; nothing was pushed.`);
};
git('merge', '-q', '--no-ff', lane, '-m', `Land step ${step}: ${title}\n\n${trailer}`);
const landedAt = git('log', '-1', '--format=%cd', '--date=format:%Y-%m-%d %H:%M');
const foldArgs = ['scripts/fold-pending-decisions.mjs'];
if (opt('replace-agreed')) foldArgs.push('--replace-agreed', opt('replace-agreed'));
const fold = run('node', foldArgs);
if (fold.status !== 0)
  undo(`folding the pending decisions failed: ${fold.stdout.trim().split('\n').pop()}`);
const folded = fold.stdout.match(/Folded into DECISIONS\.md and removed: (.*)\./)?.[1] ?? 'none';

const edit = (file, change) => {
  const path = `${root}${file}`;
  writeFileSync(path, change(readFileSync(path, 'utf8')));
};
const part = opt('part');
edit('docs/build/STAGE-2.md', (text) => {
  const open = `- [ ] **${step} `;
  if (text.split(open).length !== 2) undo(`the plan has no single open line for step ${step}`);
  if (!part) return text.replace(open, `- [x] **${step} `);
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith(open));
  const spec = lines[at].lastIndexOf('_Spec:');
  lines[at] =
    spec === -1
      ? `${lines[at]} ${part}`
      : `${lines[at].slice(0, spec)}${part} ${lines[at].slice(spec)}`;
  return lines.join('\n');
});
if (!part) {
  edit('docs/build/STATUS.md', (text) => {
    const rowStart = `| ${lane.slice(5)}`;
    const lines = text.split('\n');
    const rows = lines.filter((l) => l.startsWith(rowStart));
    if (rows.length > 1) undo(`STATUS.md has ${rows.length} rows starting "${rowStart}"`);
    return lines.filter((l) => !l.startsWith(rowStart)).join('\n');
  });
}
edit('docs/build/LOG.md', (text) => {
  const entries = '## Entries\n';
  if (!text.includes(entries)) undo('LOG.md has no "## Entries"');
  return text.replace(entries, `${entries}\n- ${landedAt} UTC — ${log}\n`);
});
if (opt('polish'))
  edit('docs/build/polish.md', (text) => `${text.trimEnd()}\n\n- ${opt('polish')}\n`);
run('npx', ['prettier', '--write', 'docs/build', 'docs/specs/v1/DECISIONS.md']);

// 5. The checks of a landing.
const checks = [
  ['the structure check', 'npm', ['run', 'check']],
  ['the format check', 'npm', ['run', 'format:check']],
  ['the pending-decisions test', 'node', ['--test', 'tests/pending-decisions.test.mjs']],
  ['the type check', 'node', ['scripts/heavy.mjs', '--', 'npm', 'run', 'typecheck']],
];
const tests = (opt('tests') ?? '').split(' ').filter(Boolean);
if (tests.length > 0)
  checks.push([
    'the named tests',
    'node',
    ['scripts/heavy.mjs', '--', 'npx', 'vitest', 'run', ...tests],
  ]);
for (const [name, cmd, a] of checks) {
  if (run(cmd, a, false).status !== 0) undo(`${name} failed (its last lines are above)`);
}

// 6. Commit, push, clear the lane.
git('add', '-A', 'docs');
git('commit', '-q', '-m', `Log step ${step}${part ? ', a part' : ''}\n\n${trailer}`);
const pushed = run('git', ['push', '-q', 'origin', build]);
if (pushed.status !== 0)
  stop(
    `landed here (${git('rev-parse', '--short=7', 'HEAD')}) but the push failed: ${pushed.stderr.trim().split('\n').pop()}`,
  );
const folder = `.local/lanes/${lane.slice(5)}`;
const keep = args.includes('--keep-folder');
const cleared = keep
  ? false
  : existsSync(`${root}${folder}`)
    ? run('git', ['worktree', 'remove', folder]).status === 0
    : true;
if (!keep) run('git', ['branch', '-D', lane]);
console.log(
  `LANDED step ${step}${part ? ' (a part; the plan line stays open, rewrite its STATUS row)' : ''}: ${lane} at ${head}.`,
);
console.log(
  `Decisions folded: ${folded}. Build branch pushed at ${git('rev-parse', '--short=7', 'HEAD')}.`,
);
console.log(
  cleared
    ? `Lane folder removed.`
    : `The lane folder ${folder} could not be removed (uncommitted files in it?).`,
);
