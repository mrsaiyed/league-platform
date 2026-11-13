// Moves GitHub's `main` forward to the newest build-branch commit that is safe to put there.
//
// `main` is the live tracker site: every push to it republishes the site. So this script
// refuses unless every one of these is true, and it never forces anything:
//   1. docs/build/STATUS.md allows pushing, and allows moving main forward.
//   2. `main` has nothing the build branch lacks (the move is a plain fast-forward).
//   3. None of the files the live site is built from differ between `main` and the commit.
//   4. No game in the tracker's schedule starts within the next 24 hours or began in the last 4.
//   5. GitHub's own checks have finished and passed on that exact commit.
// Run it with --dry-run to see what it would do. It prints one line saying what happened.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
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
const main = git('rev-parse', 'origin/main').out;
const tip = git('rev-parse', `origin/${branch}`).out;
if (!main || !tip) stop('could not read the branches.');
if (main === tip) stop('main already has everything.');
if (!git('merge-base', '--is-ancestor', main, tip).ok) {
  stop('main has commits the build branch lacks. Catch the build branch up with main first.');
}

// 4. No game near. The tracker keeps its schedules as JSON files with a list of games.
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
    if (start > now - 4 * hour && start < now + 24 * hour) {
      stop(`a game starts at ${game.startsAt}. Main is left alone around games.`);
    }
  }
}

// 5. GitHub's checks, for the newest few commits on the build branch.
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
// The newest commit may still be being checked, so look a few commits back along the branch.
const candidates = git('rev-list', '--first-parent', '-n', '12', tip)
  .out.split('\n')
  .filter(Boolean);
const liveSiteFiles = [
  'apps/live-stats',
  'packages/sports/src',
  'examples',
  'scripts/build-pages.mjs',
  'scripts/build-demo.mjs',
  'supabase/site.json',
  'supabase/setup.sql',
];
let chosen = '';
for (const sha of candidates) {
  if (sha === main || git('merge-base', '--is-ancestor', sha, main).ok) break;
  if (!passed(sha)) continue;
  // 3. The live site's own files must be untouched.
  const changed = git('diff', '--name-only', main, sha, '--', ...liveSiteFiles).out;
  if (changed) {
    stop(
      `the live site's own files differ from main (${changed.split('\n').slice(0, 3).join(', ')}). The lead moves main by hand after checking the tracker.`,
    );
  }
  chosen = sha;
  break;
}
if (!chosen) stop('GitHub has not passed its checks on any new commit yet.');

if (dryRun) {
  console.log(`Dry run: main would move from ${main.slice(0, 7)} to ${chosen.slice(0, 7)}.`);
  process.exit(0);
}
const push = git('push', 'origin', `${chosen}:refs/heads/main`);
if (!push.ok) stop(`GitHub refused the push: ${push.err.split('\n').pop()}`);
console.log(
  `Main moved from ${main.slice(0, 7)} to ${chosen.slice(0, 7)}. GitHub is now republishing the live site.`,
);
