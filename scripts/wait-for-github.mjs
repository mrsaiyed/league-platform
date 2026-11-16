// Waits for GitHub's result on a branch's newest commit and prints it. One command: no
// loop of your own, no sleep, and no model call while it waits.
//
//   node scripts/wait-for-github.mjs                              the branch you stand in
//   node scripts/wait-for-github.mjs lane/2.36-clock lane/2.36-again
//   node scripts/wait-for-github.mjs --minutes=9 <branch>
//
// Run it with a time limit of 600000. It waits up to nine minutes; GitHub needs about
// fourteen for the whole gate, so expect to run it twice. It ends with one of:
//   PASSED          every branch named passed on the commit waited for        (exit 0)
//   FAILED          at least one failed; scripts/github-check.mjs says why    (exit 1)
//   NOT PUSHED      or GitHub could not be read                               (exit 2)
//   STILL RUNNING   run the same command again                                (exit 3)
//
// Every lane's wait shares one kept copy of GitHub's list of runs (.local/github-check.json
// in the main folder, the file scripts/github-check.mjs keeps too), and only one of them
// asks GitHub at a time: about once every 75 seconds for all lanes together, less often
// when GitHub has few answers left. Without sign-in GitHub answers about 60 questions an
// hour from one computer.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, newestChecks } from './github-check-rules.mjs';
import { keepMs, verdict } from './lane-github-rules.mjs';

const here = process.cwd();
const run = (...args) => spawnSync('git', args, { cwd: here, encoding: 'utf8' });
const git = (...args) => (run(...args).stdout ?? '').trim();
const end = (code, text) => {
  console.log(text);
  process.exit(code);
};
const short = (commit) => String(commit).slice(0, 7);

const options = process.argv.slice(2);
const asked = Number.parseFloat(
  (options.find((one) => one.startsWith('--minutes=')) ?? '').slice(10),
);
const minutes = Math.min(30, Math.max(0, Number.isFinite(asked) ? asked : 9));
let branches = options.filter((one) => !one.startsWith('--'));
if (branches.length === 0) branches = [git('rev-parse', '--abbrev-ref', 'HEAD')];

const commonDir = git('rev-parse', '--git-common-dir');
if (!commonDir) end(2, 'This folder is not inside the repository.');
const mainRoot = path.dirname(path.resolve(here, commonDir));
const origin = git('remote', 'get-url', 'origin').match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!origin) end(2, 'The origin remote is not a GitHub address.');
const api = `https://api.github.com/repos/${origin[1]}/${origin[2]}`;

// The commit waited for: each branch's own newest commit on this computer. A twin that
// lives only on GitHub ("-again") waits for the first branch's commit.
const first =
  git('rev-parse', '--verify', '--quiet', `refs/heads/${branches[0]}`) || git('rev-parse', 'HEAD');
const commits = new Map();
for (const name of branches) {
  commits.set(name, git('rev-parse', '--verify', '--quiet', `refs/heads/${name}`) || first);
}

// Was it pushed? Asked of GitHub through git, which does not count against the 60 an hour.
const listed = run('ls-remote', 'origin', ...branches.map((name) => `refs/heads/${name}`));
if (listed.status === 0) {
  const there = new Map();
  for (const line of (listed.stdout ?? '').split('\n')) {
    const [commit, ref] = line.trim().split(/\s+/);
    if (commit && ref) there.set(ref.replace('refs/heads/', ''), commit);
  }
  const missing = branches.filter((name) => there.get(name) !== commits.get(name));
  if (missing.length > 0) {
    end(
      2,
      `NOT PUSHED: GitHub does not have ${short(first)} as ${missing.join(', ')}. In a lane: node scripts/push-lane.mjs`,
    );
  }
}

const cacheFile = path.join(mainRoot, '.local/github-check.json');
const askingFile = path.join(mainRoot, '.local/github-check.asking');
const kept = () => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return null;
  }
};
let blockedUntil = 0;

// GitHub's list of runs, newest first: the kept copy while it is fresh, otherwise asked for
// by one lane at a time. Any trouble gives the kept copy back and the wait goes on.
async function runs() {
  const have = kept();
  const old = have?.runs ?? [];
  blockedUntil = Math.max(blockedUntil, have?.blockedUntil ?? 0);
  if (have && Date.now() - have.at < keepMs(have.left)) return old;
  if (Date.now() < blockedUntil) return old;
  try {
    if (Date.now() - fs.statSync(askingFile).mtimeMs < 30000) return old;
    fs.rmSync(askingFile, { force: true });
  } catch {
    // Nobody is asking.
  }
  try {
    fs.mkdirSync(path.dirname(askingFile), { recursive: true });
    fs.writeFileSync(askingFile, String(process.pid), { flag: 'wx' });
  } catch {
    return old;
  }
  try {
    const response = await fetch(`${api}/actions/runs?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
    }).catch(() => null);
    if (!response) return old;
    const left = response.headers.get('x-ratelimit-remaining') ?? '';
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000;
      blockedUntil = reset > Date.now() ? reset : Date.now() + 10 * 60000;
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({ at: have?.at ?? 0, runs: old, left: '0', blockedUntil }),
      );
      return old;
    }
    if (!response.ok) return old;
    const fresh = ((await response.json()).workflow_runs ?? []).map(
      ({ id, name, head_branch, head_sha, status, conclusion }) => ({
        id,
        name,
        head_branch,
        head_sha,
        status,
        conclusion,
      }),
    );
    fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), runs: fresh, left }));
    return fresh;
  } finally {
    fs.rmSync(askingFile, { force: true });
  }
}

const deadline = Date.now() + minutes * 60000;
for (;;) {
  const checks = newestChecks(await runs());
  const now = verdict(branches, checks, commits);
  if (now.state !== 'waiting') {
    for (const name of branches) console.log(describe(name, checks.get(name), commits.get(name)));
    if (now.state === 'passed') end(0, 'PASSED: GitHub passed this commit on every branch named.');
    end(1, `FAILED. What failed and why: node scripts/github-check.mjs ${now.failedOn[0]}`);
  }
  if (Date.now() >= deadline) {
    for (const name of branches) {
      console.log(
        now.unseen.includes(name)
          ? `${name}: GitHub has not started on ${short(commits.get(name))} yet.`
          : describe(name, checks.get(name), commits.get(name)),
      );
    }
    const blocked =
      Date.now() < blockedUntil
        ? ` GitHub answers no more questions from this computer until ${new Date(blockedUntil).toISOString().slice(11, 16)} UTC.`
        : '';
    end(
      3,
      `STILL RUNNING after ${minutes} minutes.${blocked} Run the same command again. No loop, no sleep.`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 20000));
}
