// Tests of the rules behind scripts/push-lane.mjs and scripts/wait-for-github.mjs
// (scripts/lane-github-rules.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newestChecks } from '../scripts/github-check-rules.mjs';
import { keepMs, pushNames, verdict } from '../scripts/lane-github-rules.mjs';

test('a lane is pushed under its own name, then under its step number with "-again"', () => {
  assert.deepEqual(pushNames('lane/2.36-clock'), ['lane/2.36-clock']);
  assert.deepEqual(pushNames('lane/2.36-clock', 2), ['lane/2.36-clock', 'lane/2.36-again']);
  assert.deepEqual(pushNames('lane/2.93p3-stats-on-db', '3'), [
    'lane/2.93p3-stats-on-db',
    'lane/2.93p3-again',
    'lane/2.93p3-again2',
  ]);
  assert.deepEqual(pushNames('lane/plan-walk', 2), ['lane/plan-walk', 'lane/plan-walk-again']);
  assert.deepEqual(pushNames('lane/2.36-clock', 9), [
    'lane/2.36-clock',
    'lane/2.36-again',
    'lane/2.36-again2',
  ]);
});

test('nothing but a lane of its own is ever pushed', () => {
  for (const name of [
    'main',
    'build/stage-1',
    'HEAD',
    '',
    'lane/',
    'lane/2.36-again',
    'lane/2.36-again2',
    'lane/a b',
    'refs/heads/lane/x',
    'lane/x/../main',
  ]) {
    assert.equal(pushNames(name, 2), null, name);
  }
});

const runs = [
  {
    id: 4,
    name: 'Verify',
    head_branch: 'lane/2.36-again',
    head_sha: 'bbb',
    status: 'in_progress',
    conclusion: null,
  },
  {
    id: 3,
    name: 'Verify',
    head_branch: 'lane/2.36-clock',
    head_sha: 'bbb',
    status: 'completed',
    conclusion: 'success',
  },
  {
    id: 2,
    name: 'Verify',
    head_branch: 'lane/2.37-plays',
    head_sha: 'ccc',
    status: 'completed',
    conclusion: 'failure',
  },
  {
    id: 1,
    name: 'Verify',
    head_branch: 'lane/2.36-clock',
    head_sha: 'aaa',
    status: 'completed',
    conclusion: 'failure',
  },
];

test('the wait ends only when every branch named has a finished check of the commit waited for', () => {
  const checks = newestChecks(runs);
  const both = ['lane/2.36-clock', 'lane/2.36-again'];
  const commits = new Map(both.map((name) => [name, 'bbb']));
  assert.equal(verdict(['lane/2.36-clock'], checks, commits).state, 'passed');
  assert.equal(verdict(both, checks, commits).state, 'waiting');
  const done = newestChecks([
    { ...runs[0], status: 'completed', conclusion: 'success' },
    ...runs.slice(1),
  ]);
  assert.equal(verdict(both, done, commits).state, 'passed');
  const lost = newestChecks([
    { ...runs[0], status: 'completed', conclusion: 'failure' },
    ...runs.slice(1),
  ]);
  assert.deepEqual(verdict(both, lost, commits), {
    state: 'failed',
    unseen: [],
    failedOn: ['lane/2.36-again'],
  });
});

test("an older commit's result is not taken for the newest commit's", () => {
  const checks = newestChecks(runs);
  const pushedSince = new Map([['lane/2.36-clock', 'ddd']]);
  assert.deepEqual(verdict(['lane/2.36-clock'], checks, pushedSince), {
    state: 'waiting',
    unseen: ['lane/2.36-clock'],
    failedOn: [],
  });
  assert.equal(
    verdict(['lane/9.9-new'], checks, new Map([['lane/9.9-new', 'eee']])).state,
    'waiting',
  );
  assert.equal(
    verdict(['lane/2.37-plays'], checks, new Map([['lane/2.37-plays', 'ccc']])).state,
    'failed',
  );
});

test('GitHub is asked less often when it has few answers left', () => {
  assert.equal(keepMs('55'), 75000);
  assert.equal(keepMs(undefined), 75000);
  assert.equal(keepMs('14'), 150000);
  assert.equal(keepMs('5'), 300000);
  assert.equal(keepMs('0'), 300000);
});
