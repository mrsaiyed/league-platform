// Moves GitHub's `main` forward to the newest build-branch commit that is safe to put there.
//
// `main` is the live tracker site: every push to it republishes the site. So this script
// refuses unless every one of these is true, and it never forces anything:
//   1. docs/build/STATUS.md allows pushing, and allows moving main forward.
//   2. `main` has nothing the build branch lacks (the move is a plain fast-forward).
//   3. Nothing the live site is built from differs between `main` and the commit: the
//      tracker's own folders, every file its browser code pulls in (worked out by the same
//      bundler the site build uses), the libraries bundled with it, and the publish
//      workflow. New files beside the tracker's engine in packages/sports/src are fine (the
//      build plan puts the new statistics and standings there); a change to a file that
//      was already there is not.
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
// 3. What the live site is built from (scripts/build-pages.mjs and the publish workflow).
// These places are read whole by the site build, so any change at all in them refuses.
const liveSitePlaces = [
  'apps/live-stats',
  'packages/sports/src/basketball',
  'packages/database/src/live-stats',
  'packages/contracts/src/live-stats.ts',
  'examples',
  'scripts/build-pages.mjs',
  'scripts/build-demo.mjs',
  'supabase/site.json',
  'supabase/setup.sql',
  '.github/workflows/demo-pages.yml',
];
// The tracker's browser code is bundled from one starting file. Ask the bundler which files
// and which libraries that really pulls in, so nothing is missed and nothing is guessed.
const bundle = await (async () => {
  try {
    const { build } = await import('esbuild');
    const result = await build({
      entryPoints: [path.join(root, 'apps/live-stats/web/supabase-api.ts')],
      absWorkingDir: root,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs).map((file) => file.split('\\').join('/'));
    const libraries = new Set(['esbuild']);
    for (const file of inputs) {
      const inside = file.split('node_modules/').pop().split('/');
      if (file.includes('node_modules/')) {
        libraries.add(inside[0].startsWith('@') ? `${inside[0]}/${inside[1]}` : inside[0]);
      }
    }
    return { files: inputs.filter((file) => !file.includes('node_modules/')), libraries };
  } catch {
    return null;
  }
})();
if (!bundle) stop('could not work out which files the live site is built from.');
const builtFrom = [...new Set([...liveSitePlaces, ...bundle.files])];
// The version of each bundled library (and of the bundler), as the lock file pins it.
const pinned = (ref) => {
  const shown = git('show', `${ref}:package-lock.json`);
  if (!shown.ok) return null;
  const packages = JSON.parse(shown.out).packages ?? {};
  return JSON.stringify(
    Object.keys(packages)
      .filter((key) => bundle.libraries.has(key.split('node_modules/').pop()))
      .sort()
      .map((key) => [key, packages[key].version, packages[key].integrity]),
  );
};
const pagesCommand = (ref) => {
  const shown = git('show', `${ref}:package.json`);
  return shown.ok ? (JSON.parse(shown.out).scripts?.['build:pages'] ?? '') : null;
};
const firstFew = (names) => names.split('\n').slice(0, 3).join(', ');
let chosen = '';
for (const sha of candidates) {
  if (sha === main || git('merge-base', '--is-ancestor', sha, main).ok) break;
  if (!passed(sha)) continue;
  const changed = git('diff', '--name-only', main, sha, '--', ...builtFrom).out;
  if (changed) {
    stop(
      `files the live site is built from differ from main (${firstFew(changed)}). The tracker has to be checked before main moves.`,
    );
  }
  // The list above was worked out from the files in this folder, so they must be the
  // commit's own files for it to hold.
  const drifted = git('diff', '--name-only', sha, '--', ...builtFrom).out;
  if (drifted) {
    stop(`this folder's copy of the live site's files is not the commit's (${firstFew(drifted)}).`);
  }
  // The tracker's engine package: new files are fine, a changed or removed one is not.
  const touched = git(
    'diff',
    '--name-only',
    '--diff-filter=a',
    main,
    sha,
    '--',
    'packages/sports/src',
  ).out;
  if (touched) {
    stop(
      `the tracker's engine package has changed files (${firstFew(touched)}). The tracker has to be checked before main moves.`,
    );
  }
  const before = pinned(main);
  if (!before || before !== pinned(sha)) {
    stop('a library bundled into the live site would change version.');
  }
  const command = pagesCommand(main);
  if (command === null || command !== pagesCommand(sha)) {
    stop('the command that builds the live site would change.');
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
