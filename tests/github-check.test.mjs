// How scripts/github-check.mjs reads GitHub's list of runs (scripts/github-check-rules.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describe,
  failedJobLine,
  failedJobs,
  failedStepWords,
  failureNoteLines,
  newestChecks,
} from '../scripts/github-check-rules.mjs';
import { verdict } from '../scripts/lane-github-rules.mjs';
import { commitCheck } from '../scripts/promote-rules.mjs';

const run = (id, branch, commit, status, conclusion, name = 'Verify') => ({
  id,
  name,
  head_branch: branch,
  head_sha: commit,
  status,
  conclusion,
});
const a = 'a'.repeat(40);
const b = 'b'.repeat(40);

test('a branch is judged by the newest commit GitHub started checking', () => {
  const checks = newestChecks([
    run(3, 'lane/2.20', b, 'completed', 'success'),
    run(2, 'lane/2.20', a, 'completed', 'failure'),
    run(1, 'build/stage-1', a, 'completed', 'failure'),
  ]);
  assert.deepEqual(checks.get('lane/2.20'), { commit: b, state: 'passed', failedRuns: [] });
  assert.deepEqual(checks.get('build/stage-1'), { commit: a, state: 'failed', failedRuns: [1] });
});

test('a check that has not finished is running, whatever else finished', () => {
  const checks = newestChecks([
    run(2, 'lane/2.20', a, 'in_progress', null),
    run(1, 'lane/2.20', a, 'completed', 'failure', 'Other'),
  ]);
  assert.equal(checks.get('lane/2.20').state, 'running');
});

test('every workflow on the commit has to pass', () => {
  const checks = newestChecks([
    run(2, 'main', a, 'completed', 'success', 'Verify'),
    run(1, 'main', a, 'completed', 'failure', 'Publish site'),
  ]);
  assert.deepEqual(checks.get('main'), { commit: a, state: 'failed', failedRuns: [1] });
});

test('a later run of the same workflow on the same commit replaces the earlier one', () => {
  const checks = newestChecks([
    run(2, 'lane/2.20', a, 'completed', 'success'),
    run(1, 'lane/2.20', a, 'completed', 'failure'),
  ]);
  assert.equal(checks.get('lane/2.20').state, 'passed');
});

test('a cancelled or timed-out check counts as failed, not passed', () => {
  assert.equal(newestChecks([run(1, 'x', a, 'completed', 'cancelled')]).get('x').state, 'failed');
  assert.equal(newestChecks([run(1, 'x', a, 'completed', 'timed_out')]).get('x').state, 'failed');
});

test('the line says when this computer is ahead of what GitHub checked', () => {
  const passed = { commit: a, state: 'passed', failedRuns: [] };
  assert.equal(describe('lane/2.20', passed, a), `lane/2.20: PASSED on ${'a'.repeat(7)}.`);
  assert.match(describe('lane/2.20', passed, b), /PASSED on aaaaaaa\. But .* bbbbbbb.*push it/);
  assert.match(describe('lane/2.20', undefined, b), /no recent check.*bbbbbbb/);
  assert.match(describe('lane/2.20', { ...passed, state: 'running' }, a), /still being checked/);
  assert.match(describe('lane/2.20', { ...passed, state: 'failed' }, a), /FAILED on aaaaaaa/);
});

test("a failed job's annotations are shown line by line under the failed step", () => {
  // A made-up answer from GitHub's annotations address, shaped like its real ones.
  const answer = [
    {
      path: '.github',
      start_line: 1,
      annotation_level: 'failure',
      title: 'verify stopped during test:units',
      message: '> league-platform@0.1.0 test:units',
    },
    {
      path: '.github',
      start_line: 1,
      annotation_level: 'failure',
      title: 'failed',
      message: 'FAIL packages/database/src/made-up.test.ts > reads a made-up backup',
    },
    {
      path: '.github',
      start_line: 1,
      annotation_level: 'failure',
      title: 'the last 2 lines',
      message: 'Test Files  1 failed | 3 passed (4)\n     Tests  1 failed | 9 passed (10)',
    },
    { path: '.github', start_line: 1, annotation_level: 'warning', message: 'a warning' },
    {
      path: '.github',
      start_line: 1,
      annotation_level: 'failure',
      message: 'Process completed with exit code 1.',
    },
    {
      path: 'packages/core/src/made-up.ts',
      start_line: 12,
      annotation_level: 'failure',
      message: 'Type error',
    },
  ];
  assert.deepEqual(failureNoteLines(answer), [
    '  - verify stopped during test:units:',
    '      > league-platform@0.1.0 test:units',
    '  - failed:',
    '      FAIL packages/database/src/made-up.test.ts > reads a made-up backup',
    '  - the last 2 lines:',
    '      Test Files  1 failed | 3 passed (4)',
    '           Tests  1 failed | 9 passed (10)',
    '  - packages/core/src/made-up.ts:12 Type error',
  ]);
  assert.deepEqual(failureNoteLines(null), []);
  assert.equal(
    failedStepWords({
      name: 'npm run test:web:browser',
      started_at: '2026-11-15T11:40:02Z',
      completed_at: '2026-11-15T11:40:19Z',
    }),
    'npm run test:web:browser (11:40:02 to 11:40:19 UTC, 17 s)',
  );
  assert.equal(failedStepWords({ name: 'Run npm ci', started_at: null }), 'npm ci');
  const many = failureNoteLines(answer, 4);
  assert.equal(many.length, 4);
  assert.equal(many[3], '  (5 more lines on GitHub)');
});

// Since step 2.191 the gate is one workflow run with several jobs side by side. Each case
// below is a made-up answer from GitHub, shaped like its real ones: the run as GitHub's list
// of runs gives it, and the run's jobs as its list of jobs gives them. GitHub keeps the run
// unfinished until every job has finished, and calls it a success only when every job
// succeeded; every reader gives one verdict from the run.
const job = (name, status, conclusion, steps = []) => ({ name, status, conclusion, steps });
const passedJobs = [
  job('checks, typecheck, formatting, demo build', 'completed', 'success'),
  job('unit tests (node)', 'completed', 'success'),
  job('unit tests (vitest)', 'completed', 'success'),
  job('web shell check', 'completed', 'success'),
  job('tracker and demo browser checks', 'completed', 'success'),
  job('web browser tests 1 of 3', 'completed', 'success'),
  job('web browser tests 3 of 3', 'completed', 'success'),
  job('hosted-build', 'completed', 'success'),
];
const failedStep = {
  name: 'npm run test:web:browser',
  conclusion: 'failure',
  started_at: '2026-11-16T18:01:00Z',
  completed_at: '2026-11-16T18:04:00Z',
};
const cases = {
  'one job failed, the rest passed': {
    run: run(9, 'lane/2.191-ci-parallel', a, 'completed', 'failure'),
    jobs: [
      ...passedJobs,
      job('web browser tests 2 of 3', 'completed', 'failure', [
        { name: 'Run npm ci', conclusion: 'success' },
        failedStep,
        { name: 'Say what failed in the browser tests', conclusion: 'success' },
      ]),
    ],
    state: 'failed',
    line: /FAILED on aaaaaaa/,
    wait: 'failed',
    promote: 'failed',
  },
  'one job still running, the rest passed': {
    run: run(9, 'lane/2.191-ci-parallel', a, 'in_progress', null),
    jobs: [...passedJobs, job('web browser tests 2 of 3', 'in_progress', null)],
    state: 'running',
    line: /still being checked \(aaaaaaa\)/,
    wait: 'waiting',
    promote: 'running',
  },
  'one job not started yet, the rest passed': {
    run: run(9, 'lane/2.191-ci-parallel', a, 'queued', null),
    jobs: [...passedJobs, job('web browser tests 2 of 3', 'queued', null)],
    state: 'running',
    line: /still being checked/,
    wait: 'waiting',
    promote: 'running',
  },
  'every job passed': {
    run: run(9, 'lane/2.191-ci-parallel', a, 'completed', 'success'),
    jobs: [...passedJobs, job('web browser tests 2 of 3', 'completed', 'success')],
    state: 'passed',
    line: /PASSED on aaaaaaa\.$/,
    wait: 'passed',
    promote: 'passed',
  },
};

for (const [name, given] of Object.entries(cases)) {
  test(`several jobs give one verdict: ${name}`, () => {
    const branch = 'lane/2.191-ci-parallel';
    const checks = newestChecks([given.run]);
    assert.equal(checks.get(branch).state, given.state);
    // scripts/github-check.mjs
    assert.match(describe(branch, checks.get(branch), a), given.line);
    // scripts/wait-for-github.mjs
    assert.equal(verdict([branch], checks, new Map([[branch, a]])).state, given.wait);
    // scripts/promote-to-main.mjs
    assert.equal(commitCheck([given.run], a), given.promote);
    // Only a finished job that did not succeed is named, with the step that failed.
    const named = failedJobs(given.jobs);
    if (given.state === 'failed') {
      assert.deepEqual(
        named.map((one) => one.name),
        ['web browser tests 2 of 3'],
      );
      assert.equal(
        failedJobLine(named[0]),
        '  Failed in the job "web browser tests 2 of 3": npm run test:web:browser (18:01:00 to 18:04:00 UTC, 180 s)',
      );
    } else {
      assert.deepEqual(named, []);
    }
  });
}

test('a cancelled or timed-out job is named; a skipped one is not; a commit unchecked is not passed', () => {
  const named = failedJobs([
    job('unit tests', 'completed', 'cancelled'),
    job('web browser tests 1 of 3', 'completed', 'timed_out'),
    job('web shell check', 'completed', 'skipped'),
    job('checks, typecheck, formatting, demo build', 'completed', 'success'),
  ]);
  assert.deepEqual(
    named.map((one) => one.name),
    ['unit tests', 'web browser tests 1 of 3'],
  );
  assert.equal(failedJobLine(named[0]), '  Failed in the job "unit tests": cancelled');
  assert.deepEqual(failedJobs(null), []);
  assert.equal(commitCheck([], a), 'unchecked');
  // Two workflows on one commit: both must pass, and a failed one is failed even while the
  // other still runs (as promote-to-main.mjs read it before 2.191).
  assert.equal(
    commitCheck(
      [run(2, 'x', a, 'completed', 'success'), run(1, 'x', a, 'completed', 'success', 'Other')],
      a,
    ),
    'passed',
  );
  assert.equal(
    commitCheck(
      [run(2, 'x', a, 'in_progress', null), run(1, 'x', a, 'completed', 'failure', 'Other')],
      a,
    ),
    'failed',
  );
  assert.equal(commitCheck([run(1, 'x', b, 'completed', 'success')], a), 'unchecked');
});

// The rule that lets main move (scripts/promote-to-main.mjs) passes a commit only when every
// one of its runs finished and succeeded. Each case below fails a looser rule: `some` run
// succeeded, only the newest run counts, or a skipped run counts as success.
test('promote passes a commit only when every run of it finished and succeeded', () => {
  const ok = (id, name = 'Verify') => run(id, 'x', a, 'completed', 'success', name);
  const ended = (id, conclusion) => run(id, 'x', a, 'completed', conclusion);
  // The same commit checked twice (a re-run, or a lane and its twin): one failure is enough,
  // whichever run is newer and whichever order GitHub lists them in.
  assert.equal(commitCheck([ok(2), ended(1, 'failure')], a), 'failed');
  assert.equal(commitCheck([ended(1, 'failure'), ok(2)], a), 'failed');
  assert.equal(commitCheck([ended(2, 'failure'), ok(1)], a), 'failed');
  assert.equal(commitCheck([ok(1), ended(2, 'failure')], a), 'failed');
  assert.equal(commitCheck([ok(3), ok(2), ended(1, 'failure')], a), 'failed');
  // Every finished conclusion that is not success is a failure, alone or beside a success,
  // and so is a finished run that says no conclusion at all.
  for (const conclusion of [
    'failure',
    'skipped',
    'cancelled',
    'timed_out',
    'neutral',
    'action_required',
    'stale',
    'startup_failure',
    null,
    undefined,
  ]) {
    assert.equal(commitCheck([ended(1, conclusion)], a), 'failed', String(conclusion));
    assert.equal(commitCheck([ok(2), ended(1, conclusion)], a), 'failed', String(conclusion));
    assert.equal(commitCheck([ended(2, conclusion), ok(1)], a), 'failed', String(conclusion));
  }
  const { conclusion: _, ...noConclusion } = ended(1, 'success');
  assert.equal(commitCheck([ok(2), noConclusion], a), 'failed');
  // A run still going beside a finished success is not passed yet.
  for (const status of ['queued', 'in_progress', 'waiting', 'requested', 'pending']) {
    const going = run(2, 'x', a, status, null);
    assert.equal(commitCheck([going, ok(1)], a), 'running', status);
    assert.equal(commitCheck([ok(1), going], a), 'running', status);
    assert.equal(commitCheck([ok(3), going], a), 'running', status);
  }
  // Two finished successes, of the same workflow or of two, pass; other commits do not count.
  assert.equal(commitCheck([ok(2), ok(1)], a), 'passed');
  assert.equal(commitCheck([ok(2), ok(1, 'Other')], a), 'passed');
  assert.equal(commitCheck([ok(2), run(1, 'x', b, 'completed', 'failure')], a), 'passed');
});
