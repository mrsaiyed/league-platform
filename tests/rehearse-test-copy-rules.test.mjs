// The pure rules of `npm run rehearse:test-copy` (step 2.207): scripts/rehearse-test-copy-rules.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  addressAs,
  answerDue,
  codeIn,
  hidden,
  leftBehind,
  pageSteps,
  splitAddress,
  whereInPage,
} from '../scripts/rehearse-test-copy-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const procedure = readFileSync(path.join(root, 'docs/operations/new-test-copy.md'), 'utf8');

test('every step the rehearsal names is a heading of the procedure, so a failure names its line', () => {
  for (const id of Object.keys(pageSteps)) {
    const where = whereInPage(procedure, id);
    assert.ok(where.line > 0, `${id}: "${pageSteps[id].heading}" is not in the page`);
  }
  assert.deepEqual(whereInPage('a\n## 3. Apply the database changes\n', 'release'), {
    step: '3',
    heading: '3. Apply the database changes',
    line: 2,
  });
  assert.equal(whereInPage('nothing here', 'release').line, 0);
});

test('an address loses its password and query, and takes another login', () => {
  const split = splitAddress('postgresql://postgres:s3cret@localhost:5000/db?sslmode=verify-full');
  assert.deepEqual(split, {
    address: 'postgresql://postgres@localhost:5000/db',
    password: 's3cret',
    user: 'postgres',
  });
  assert.equal(
    addressAs(split.address, 'app_login', 'abc123'),
    'postgresql://app_login:abc123@localhost:5000/db',
  );
});

test('an answer is typed only once its own question has appeared, in order', () => {
  const answers = [
    { after: /password: $/, send: 'one' },
    { after: /name: $/, send: 'two' },
  ];
  assert.equal(answerDue('Where: localhost\n', answers, 0), null);
  assert.equal(answerDue('The password: ', answers, 0)?.send, 'one');
  assert.equal(answerDue('The password: ', answers, 1), null);
  assert.equal(answerDue('type the name: ', answers, 1)?.send, 'two');
  assert.equal(answerDue('anything', answers, 2), null);
  // As Node's line reader writes its question at a terminal (seen in the first rehearsal).
  assert.equal(answerDue('\u001b[1G\u001b[0Jtype the name: \u001b[90G', answers, 1)?.send, 'two');
});

test('the code is the one line of six digits, else none', () => {
  assert.equal(codeIn('482913\r\n'), '482913');
  assert.equal(codeIn('> node x\n482913\n'), '482913');
  assert.equal(codeIn('no code here\n'), null);
  assert.equal(codeIn('111111\n222222\n'), null);
});

test('secrets are hidden and only what the run added counts as left behind', () => {
  assert.equal(hidden('a pw1 b pw2 pw1', ['pw1', 'pw2', '']), 'a [hidden] b [hidden] [hidden]');
  assert.deepEqual(leftBehind(' M docs/a.md\n', ' M docs/a.md\n?? apps/web/x.txt\n'), [
    'apps/web/x.txt',
  ]);
  assert.deepEqual(leftBehind('', ''), []);
});
