// The parts of scripts/push-lane.mjs and scripts/wait-for-github.mjs that can be tested by
// themselves (tests/lane-github.test.mjs).

const lane = /^lane\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The names a lane's newest commit is pushed under so that GitHub checks it `times` times:
 * the lane's own name, then the step's number with "-again", then with "-again2" (the
 * names the lead has used since 2026-11-13). Null when `branch` is not a lane's own branch.
 */
export function pushNames(branch, times = 1) {
  if (!lane.test(branch) || /-again\d*$/.test(branch)) return null;
  const count = Math.min(3, Math.max(1, Number.parseInt(String(times), 10) || 1));
  const step = branch.match(/^lane\/(\d+\.\d+(?:p\d+)?)(?:-|$)/)?.[1];
  const stem = step ? `lane/${step}` : branch;
  return [branch, `${stem}-again`, `${stem}-again2`].slice(0, count);
}

/**
 * Where a wait stands. `checks` is newestChecks() of GitHub's list of runs; `commits` gives
 * for each branch the commit being waited for.
 *   passed, failed: GitHub finished checking that commit on every branch named
 *   waiting: a branch is still being checked, or GitHub has not started on its commit
 * `unseen` names the branches GitHub has not started on.
 */
export function verdict(branches, checks, commits) {
  let waiting = false;
  let failed = false;
  const unseen = [];
  const failedOn = [];
  for (const name of branches) {
    const check = checks.get(name);
    const commit = commits.get(name) ?? '';
    if (!check || (commit && check.commit !== commit)) {
      waiting = true;
      unseen.push(name);
    } else if (check.state === 'running') {
      waiting = true;
    } else if (check.state === 'failed') {
      failed = true;
      failedOn.push(name);
    }
  }
  return { state: waiting ? 'waiting' : failed ? 'failed' : 'passed', unseen, failedOn };
}

/**
 * How long the kept copy of GitHub's list may be used before GitHub is asked again, in
 * milliseconds. GitHub answers about 60 questions an hour from one computer without
 * sign-in, so the fewer it has left, the longer the copy is kept.
 */
export function keepMs(left) {
  const number = Number.parseInt(String(left ?? ''), 10);
  if (!Number.isFinite(number)) return 75000;
  if (number < 6) return 300000;
  if (number < 15) return 150000;
  return 75000;
}
