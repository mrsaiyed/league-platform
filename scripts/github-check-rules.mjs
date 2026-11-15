// Works out the newest check of each branch from GitHub's list of workflow runs. Kept
// apart from scripts/github-check.mjs, which asks GitHub, so it can be tested by itself
// (tests/github-check.test.mjs).

// `runs` is GitHub's list, newest first. For each branch: the newest commit GitHub has
// started checking, and for that commit the newest run of each workflow.
//   passed:  every one of those runs finished and succeeded
//   failed:  every one finished, and at least one did not succeed
//   running: at least one has not finished
export function newestChecks(runs) {
  const branches = new Map();
  for (const run of runs) {
    if (!run.head_branch || !run.head_sha) continue;
    let branch = branches.get(run.head_branch);
    if (!branch) {
      branch = { commit: run.head_sha, workflows: new Map() };
      branches.set(run.head_branch, branch);
    }
    if (branch.commit !== run.head_sha) continue;
    if (!branch.workflows.has(run.name)) branch.workflows.set(run.name, run);
  }
  const checks = new Map();
  for (const [name, branch] of branches) {
    const newest = [...branch.workflows.values()];
    const unfinished = newest.some((run) => run.status !== 'completed');
    const failed = newest.filter(
      (run) => run.status === 'completed' && run.conclusion !== 'success',
    );
    checks.set(name, {
      commit: branch.commit,
      state: unfinished ? 'running' : failed.length > 0 ? 'failed' : 'passed',
      failedRuns: failed.map((run) => run.id),
    });
  }
  return checks;
}

// The lines to show under "Failed step" from GitHub's annotations of a failed job: each
// failure note's title, then every line of its message (the gate's own notes, written by
// scripts/verify-failure-notes.mjs and scripts/browser-failure-notes.mjs, carry several),
// at most `most` lines in all.
export function failureNoteLines(notes, most = 60) {
  const failures = (Array.isArray(notes) ? notes : []).filter(
    (note) => note.annotation_level === 'failure' && !/^Process completed/.test(note.message ?? ''),
  );
  const lines = [];
  for (const note of failures) {
    const where =
      note.path && note.path !== '.github' ? `${note.path}:${note.start_line ?? ''} ` : '';
    const message = (note.message ?? '').split(/\r?\n/).filter((line) => line.trim() !== '');
    const [first = '', ...rest] = note.title ? [`${note.title}:`, ...message] : message;
    lines.push(`  - ${where}${first}`.slice(0, 500));
    for (const line of rest) lines.push(`      ${line}`.slice(0, 500));
  }
  if (lines.length <= most) return lines;
  return [...lines.slice(0, most - 1), `  (${lines.length - most + 1} more lines on GitHub)`];
}

// A failed step as GitHub's list of a job's steps gives it: its name, and when it ran in
// UTC and for how long, when GitHub says.
export function failedStepWords(step) {
  const name = (step.name ?? '').replace(/^Run /, '');
  const from = Date.parse(step.started_at ?? '');
  const to = Date.parse(step.completed_at ?? '');
  if (Number.isNaN(from) || Number.isNaN(to)) return name;
  const time = (at) => new Date(at).toISOString().slice(11, 19);
  return `${name} (${time(from)} to ${time(to)} UTC, ${Math.round((to - from) / 1000)} s)`;
}

// One plain line about a branch. `local` is this computer's newest commit on it, or ''.
export function describe(branch, check, local) {
  const short = (commit) => commit.slice(0, 7);
  if (!check) {
    return `${branch}: GitHub has no recent check for it${local ? ` (this computer has ${short(local)}; push it to have it checked)` : ''}.`;
  }
  const words = {
    passed: `PASSED on ${short(check.commit)}`,
    failed: `FAILED on ${short(check.commit)}`,
    running: `still being checked (${short(check.commit)})`,
  }[check.state];
  const behind =
    local && local !== check.commit
      ? ` But this computer's newest commit there is ${short(local)}, which GitHub has not checked: push it.`
      : '';
  return `${branch}: ${words}.${behind}`;
}
