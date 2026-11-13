// Moves GitHub's `main` forward to the newest build-branch commit that is safe to put there.
//
// `main` is the branch the live tracker site is published from, but the site is built from
// one fixed commit, named on the "ref:" line of .github/workflows/demo-pages.yml, and that
// workflow runs only when it itself changes. So an ordinary move of `main` cannot change
// the live site, and this script makes one when every one of these is true:
//   1. docs/build/STATUS.md allows pushing, and allows moving main forward.
//   2. `main` has nothing the build branch lacks (the move is a plain fast-forward).
//   3. GitHub's own checks have finished and passed on that exact commit.
//   4. The publish workflow at that commit still builds from one fixed commit, and no
//      workflow that reaches the live site or its database differs from main's copy.
// It never forces anything.
//
// A move that does change one of those workflows is a release of the live tracker: what
// people at a game see can change. Only the lead makes one, in a session the founder
// started, never an unattended run and never a builder:
//   node scripts/promote-to-main.mjs --release-tracker=<the commit on the "ref:" line>
// A release needs all of the above except the last half of 4, and also that no game in the
// tracker's schedule starts within the next 24 hours or began in the last 4. The lead
// checks the tracker at that commit before a release, and the live site after it.
//
// Run it with --dry-run to see what it would do. It prints one line saying what happened.
// The rules themselves are in scripts/promote-rules.mjs, with their tests.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decideMove, pinnedCommit, publishWorkflow, reachesLiveSite } from './promote-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const releaseFlag = '--release-tracker=';
const releaseArg = (process.argv.find((arg) => arg.startsWith(releaseFlag)) ?? '').slice(
  releaseFlag.length,
);
const git = (...args) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: (result.stderr ?? '').trim(),
  };
};
const stop = (why) => {
  console.log(`Main not moved: ${why}`);
  process.exit(0);
};
const short = (commit) => commit.slice(0, 7);
if (process.argv.some((arg) => arg.startsWith('--release-tracker')) && !releaseArg) {
  stop('--release-tracker needs the commit, written as --release-tracker=<commit>.');
}

// 1. Permission, from the status file.
const status = fs.readFileSync(path.join(root, 'docs/build/STATUS.md'), 'utf8');
const field = (label) =>
  (status.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.*)`))?.[1] ?? '').replace(/[`*]/g, '');
const branch = field('Branch').trim();
if (!branch || branch === 'main') stop('STATUS.md names no build branch.');
if (!field('Pushing to GitHub').startsWith('allowed')) stop('STATUS.md does not allow pushing.');
if (!field('Moving main forward').startsWith('allowed')) {
  stop('STATUS.md does not allow moving main forward.');
}
const origin = git('remote', 'get-url', 'origin').out.match(
  /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/,
);
if (!origin) stop('the origin remote is not a GitHub address.');
const [, owner, repo] = origin;

// 2. A plain fast-forward.
if (!git('fetch', 'origin', 'main', branch).ok) stop('could not fetch from GitHub.');
const main = git('rev-parse', '--verify', '--quiet', 'origin/main').out;
const tip = git('rev-parse', '--verify', '--quiet', `origin/${branch}`).out;
if (!main || !tip) stop('could not read the branches.');
if (main === tip) stop('main already has everything.');
if (!git('merge-base', '--is-ancestor', main, tip).ok) {
  stop('main has commits the build branch lacks. Catch the build branch up with main first.');
}

// 3. GitHub's checks, for the newest few commits on the build branch.
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=40`,
  { headers: { Accept: 'application/vnd.github+json' } },
).catch(() => null);
if (!response || !response.ok) stop('could not ask GitHub whether its checks passed.');
const runs = (await response.json()).workflow_runs ?? [];
const passed = (sha) => {
  const mine = runs.filter((run) => run.head_sha === sha);
  return (
    mine.length > 0 &&
    mine.every((run) => run.status === 'completed' && run.conclusion === 'success')
  );
};
// The newest commit may still be being checked, and GitHub checks only the last commit of
// each push, so look well back along the branch.
const candidates = git('rev-list', '--first-parent', '-n', '60', tip)
  .out.split('\n')
  .filter(Boolean);
let chosen = '';
let failed = '';
for (const sha of candidates) {
  if (sha === main || git('merge-base', '--is-ancestor', sha, main).ok) break;
  if (passed(sha)) {
    chosen = sha;
    break;
  }
  const finished = runs.filter((run) => run.head_sha === sha && run.status === 'completed');
  if (!failed && finished.some((run) => run.conclusion !== 'success')) failed = sha;
}
if (!chosen) {
  stop(
    failed
      ? `GitHub's checks failed on ${short(failed)} and have not passed on any newer commit. Find out why before landing more: a failure on GitHub is not this computer being busy.`
      : 'GitHub has not passed its checks on any new commit yet.',
  );
}

// 4. The workflows that reach the live tracker, on main and at the commit.
const liveWorkflows = (ref) => {
  const listed = git('ls-tree', '-r', '--name-only', ref, '--', '.github/workflows');
  if (!listed.ok) return null;
  const found = {};
  for (const file of listed.out.split('\n').filter(Boolean)) {
    const shown = git('show', `${ref}:${file}`);
    if (!shown.ok) return null;
    if (reachesLiveSite(file, shown.out)) found[file] = shown.out;
  }
  return found;
};
const before = liveWorkflows(main);
const after = liveWorkflows(chosen);
if (!before || !after) stop('could not read the workflows on main and on the build branch.');

// A release is never made around a game. The tracker keeps its schedules as JSON files
// with a list of games.
const gameNear = () => {
  const dataDir = path.join(root, 'apps/live-stats/data');
  const now = Date.now();
  const hour = 3600 * 1000;
  for (const name of fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : []) {
    if (!name.endsWith('.json')) continue;
    let games = [];
    try {
      games = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')).games ?? [];
    } catch {
      stop(`could not read the schedule in ${name}, so a game cannot be ruled out.`);
    }
    for (const game of games) {
      const start = new Date(game.startsAt).getTime();
      if (Number.isNaN(start)) continue;
      if (start > now - 4 * hour && start < now + 24 * hour) return String(game.startsAt);
    }
  }
  return '';
};

const pin = pinnedCommit(after[publishWorkflow] ?? '');
const decision = decideMove({
  before,
  after,
  pinInBranch: Boolean(pin) && git('merge-base', '--is-ancestor', pin, chosen).ok,
  releaseArg,
  gameNear: releaseArg ? gameNear() : '',
});
if (decision.refuse) stop(decision.refuse);

const moved = `from ${short(main)} to ${short(chosen)}`;
const release = decision.move === 'release';
const was = decision.from && decision.from !== decision.pin ? `, was ${short(decision.from)}` : '';
if (dryRun) {
  console.log(
    release
      ? `Dry run: main would move ${moved}, as a release of the live tracker (${decision.changed.join(', ')}), published from version ${short(decision.pin)}${was}.`
      : `Dry run: main would move ${moved}. The live tracker would be untouched: it stays on version ${short(decision.pin)}.`,
  );
  process.exit(0);
}
const push = git('push', 'origin', `${chosen}:refs/heads/main`);
if (!push.ok) stop(`GitHub refused the push: ${push.err.split('\n').pop()}`);
console.log(
  release
    ? `Main moved ${moved}, as a release of the live tracker (${decision.changed.join(', ')}). GitHub is now publishing it from version ${short(decision.pin)}${was}.`
    : `Main moved ${moved}. The live tracker is untouched: it stays on version ${short(decision.pin)}.`,
);
