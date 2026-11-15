// How scripts/github-check.mjs reads GitHub's list of runs (scripts/github-check-rules.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describe,
  failedStepWords,
  failureNoteLines,
  newestChecks,
} from '../scripts/github-check-rules.mjs';

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
