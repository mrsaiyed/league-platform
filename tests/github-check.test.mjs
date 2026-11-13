// How scripts/github-check.mjs reads GitHub's list of runs (scripts/github-check-rules.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, newestChecks } from '../scripts/github-check-rules.mjs';

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
