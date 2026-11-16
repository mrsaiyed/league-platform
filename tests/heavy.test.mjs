// Tests of the turns scripts/heavy.mjs gives out (scripts/heavy-rules.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { claimTurn, commandLine, slotCount, turnLines } from '../scripts/heavy-rules.mjs';

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-turns-'));
const everyoneRuns = () => true;
const nobodyRuns = () => false;

test('three heavy commands at once unless a number says otherwise', () => {
  assert.equal(slotCount({}, ''), 3);
  assert.equal(slotCount({ HEAVY_SLOTS: '2' }, '5'), 2);
  assert.equal(slotCount({}, ' 5\n'), 5);
  assert.equal(slotCount({ HEAVY_SLOTS: '0' }, ''), 1);
  assert.equal(slotCount({ HEAVY_SLOTS: '40' }, ''), 8);
  assert.equal(slotCount({ HEAVY_SLOTS: 'many' }, 'x'), 3);
});

test('turns are given out until none is left, and a released turn is given again', () => {
  const dir = folder();
  const options = { now: 1000, alive: everyoneRuns };
  const first = claimTurn(dir, 2, { pid: 11, command: 'one' }, options);
  const second = claimTurn(dir, 2, { pid: 12, command: 'two' }, options);
  assert.equal(path.basename(first), 'turn-1.json');
  assert.equal(path.basename(second), 'turn-2.json');
  assert.equal(claimTurn(dir, 2, { pid: 13, command: 'three' }, options), null);
  fs.rmSync(first);
  assert.equal(
    path.basename(claimTurn(dir, 2, { pid: 13, command: 'three' }, options)),
    'turn-1.json',
  );
  assert.equal(JSON.parse(fs.readFileSync(first, 'utf8')).pid, 13);
});

test('a turn whose program has ended is free', () => {
  const dir = folder();
  claimTurn(dir, 1, { pid: 11, command: 'gone' }, { now: 1000, alive: everyoneRuns });
  assert.equal(
    claimTurn(dir, 1, { pid: 12, command: 'next' }, { now: 2000, alive: everyoneRuns }),
    null,
  );
  const taken = claimTurn(dir, 1, { pid: 12, command: 'next' }, { now: 2000, alive: nobodyRuns });
  assert.equal(JSON.parse(fs.readFileSync(taken, 'utf8')).command, 'next');
});

test('a turn held for longer than the limit is free', () => {
  const dir = folder();
  claimTurn(dir, 1, { pid: 11, command: 'stuck' }, { now: 0, alive: everyoneRuns });
  const options = { alive: everyoneRuns, staleMs: 60000 };
  assert.equal(claimTurn(dir, 1, { pid: 12, command: 'next' }, { ...options, now: 59000 }), null);
  assert.notEqual(
    claimTurn(dir, 1, { pid: 12, command: 'next' }, { ...options, now: 61000 }),
    null,
  );
});

test('the list of turns says who holds each', () => {
  const dir = folder();
  assert.deepEqual(turnLines(path.join(dir, 'missing')), []);
  claimTurn(dir, 2, { pid: 11, command: 'npm run typecheck' }, { now: 0, alive: everyoneRuns });
  const lines = turnLines(dir, { now: 5 * 60000, alive: everyoneRuns });
  assert.deepEqual(lines, ['turn-1: npm run typecheck, for 5 min']);
  assert.match(turnLines(dir, { now: 0, alive: nobodyRuns })[0], /the turn is free/);
});

test('the words after "--" become one command line', () => {
  assert.equal(commandLine(['npm', 'run', 'typecheck'], 'win32'), 'npm run typecheck');
  assert.equal(
    commandLine(['node', 'tests/browser/a-test.mjs', '--only=home page'], 'win32'),
    'node tests/browser/a-test.mjs "--only=home page"',
  );
  assert.equal(commandLine(['echo', "it's"], 'linux'), "echo 'it'\\''s'");
});
