// Says what GitHub's own machines found when they ran the whole gate.
//
// GitHub runs .github/workflows/ci.yml (`npm run verify` and the browser checks) on every
// branch that is pushed, on a machine that is doing nothing else. This computer is slow
// when every lane is busy, and a gate run here can time out before it reaches a real
// failure. So the whole gate is GitHub's job (docs/build/RUNBOOK.md, section 3).
//
//   node scripts/github-check.mjs            one line for the build branch and each lane
//   node scripts/github-check.mjs <branch>   that branch only, with what failed and why
//
// It only reads. Without sign-in GitHub answers about 60 questions an hour from one
// computer, so the list is kept for 45 seconds in .local/ and the script warns when few
// questions are left. Do not run it in a loop: once after a push has had seven minutes.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, newestChecks } from './github-check-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wanted = process.argv[2] ?? '';
const git = (...args) =>
  (spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout ?? '').trim();
const stop = (why) => {
  console.log(`GitHub's checks could not be read: ${why}`);
  process.exit(0);
};

const status = fs.readFileSync(path.join(root, 'docs/build/STATUS.md'), 'utf8');
const buildBranch = (status.match(/\*\*Branch:\*\*\s*(.*)/)?.[1] ?? '').replace(/[`*]/g, '').trim();
const origin = git('remote', 'get-url', 'origin').match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!origin) stop('the origin remote is not a GitHub address.');
const api = `https://api.github.com/repos/${origin[1]}/${origin[2]}`;
let left = '';
const ask = async (address) => {
  const response = await fetch(address, {
    headers: { Accept: 'application/vnd.github+json' },
  }).catch(() => null);
  if (!response) stop('GitHub could not be reached. Run the whole gate here instead.');
  left = response.headers.get('x-ratelimit-remaining') ?? left;
  if (response.status === 403 || response.status === 429) {
    stop('GitHub is answering no more questions this hour. Wait, or run the whole gate here.');
  }
  if (!response.ok) stop(`GitHub answered ${response.status}.`);
  return response.json();
};

// The list of runs, newest first, kept for 45 seconds.
const cacheFile = path.join(root, '.local/github-check.json');
let runs = null;
try {
  const kept = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  if (Date.now() - kept.at < 45000) runs = kept.runs;
} catch {
  // No list kept yet.
}
if (!runs) {
  const listed = (await ask(`${api}/actions/runs?per_page=100`)).workflow_runs ?? [];
  runs = listed.map(({ id, name, head_branch, head_sha, status: state, conclusion }) => ({
    id,
    name,
    head_branch,
    head_sha,
    status: state,
    conclusion,
  }));
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), runs }));
}
const checks = newestChecks(runs);

// This computer's branches: the build branch and every lane.
const local = new Map();
for (const line of git(
  'for-each-ref',
  '--format=%(refname:short) %(objectname)',
  'refs/heads/lane',
  `refs/heads/${buildBranch}`,
).split('\n')) {
  const [name, commit] = line.split(' ');
  if (name && commit) local.set(name, commit);
}
const names = wanted
  ? [wanted]
  : [
      ...new Set([
        buildBranch,
        ...local.keys(),
        ...[...checks.keys()].filter((name) => name.startsWith('lane/')),
      ]),
    ].filter(Boolean);
for (const name of names) console.log(describe(name, checks.get(name), local.get(name) ?? ''));

// For one branch that failed: which step, and what the failing tests said.
const check = wanted ? checks.get(wanted) : null;
if (check && check.state === 'failed') {
  for (const run of check.failedRuns) {
    const jobs = (await ask(`${api}/actions/runs/${run}/jobs`)).jobs ?? [];
    for (const job of jobs.filter((one) => one.conclusion !== 'success')) {
      const steps = (job.steps ?? [])
        .filter((step) => step.conclusion !== 'success' && step.conclusion !== 'skipped')
        .map((step) => step.name.replace(/^Run /, ''));
      console.log(`  Failed step: ${steps.join(', ') || job.name}`);
      const notes = await ask(`${api}/check-runs/${job.id}/annotations`);
      const failures = (Array.isArray(notes) ? notes : []).filter(
        (note) =>
          note.annotation_level === 'failure' && !/^Process completed/.test(note.message ?? ''),
      );
      for (const note of failures.slice(0, 6)) {
        const text = `${note.title ? `${note.title}: ` : ''}${note.message ?? ''}`;
        console.log(
          `  - ${note.path}:${note.start_line} ${text.replace(/\s+/g, ' ').slice(0, 500)}`,
        );
      }
      if (failures.length === 0) {
        console.log(
          '  GitHub gave no test names for this one. Run that step here, by itself, in the lane to see it.',
        );
      }
    }
  }
}
if (left !== '' && Number(left) < 12) {
  console.log(`Careful: GitHub will answer only ${left} more questions this hour.`);
}
