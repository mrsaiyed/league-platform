// The strict reader the gate's tests read .github/workflows/ci.yml with
// (scripts/workflow-reader.mjs): what it reads, and that it refuses what it does not.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { readWorkflow } from '../scripts/workflow-reader.mjs';

test('mappings, sequences, scalars and comments read as GitHub reads them', () => {
  const text = [
    '# a comment first',
    'name: Verify',
    'on: [push, pull_request]',
    'env:',
    "  QUOTED: '1'",
    '  DOUBLE: "it\'s"',
    "  SINGLE: 'it''s'",
    'jobs:',
    '  # a comment between keys',
    '  one:',
    '    name: unit tests (${{ matrix.shard }} of ${{ strategy.job-total }})',
    '    strategy:',
    '      fail-fast: false',
    '      matrix:',
    '        shard: [1, 2, 3]',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '24'",
    '          cache: npm # a comment after a value',
    '      - name: npm test',
    "        if: failure() && steps.x.outcome == 'failure'",
    '        run: |',
    '          set -o pipefail',
    '',
    '          npm test 2>&1 | tee "$RUNNER_TEMP/out.txt"',
    '          # a shell comment is part of the block',
    '      # a comment that ends the block',
    '      - plain item',
    '      - run: node x.mjs "$RUNNER_TEMP/out.txt"',
    '  two:',
    '    empty:',
    '    nothing: null',
    '',
  ].join('\n');
  assert.deepEqual(readWorkflow(text), {
    name: 'Verify',
    on: ['push', 'pull_request'],
    env: { QUOTED: '1', DOUBLE: "it's", SINGLE: "it's" },
    jobs: {
      one: {
        name: 'unit tests (${{ matrix.shard }} of ${{ strategy.job-total }})',
        strategy: { 'fail-fast': false, matrix: { shard: [1, 2, 3] } },
        steps: [
          { uses: 'actions/checkout@v4' },
          { uses: 'actions/setup-node@v4', with: { 'node-version': '24', cache: 'npm' } },
          {
            name: 'npm test',
            if: "failure() && steps.x.outcome == 'failure'",
            run: 'set -o pipefail\n\nnpm test 2>&1 | tee "$RUNNER_TEMP/out.txt"\n# a shell comment is part of the block\n',
          },
          'plain item',
          { run: 'node x.mjs "$RUNNER_TEMP/out.txt"' },
        ],
      },
      two: { empty: null, nothing: null },
    },
  });
  // Windows line ends read the same.
  assert.deepEqual(readWorkflow(text.replace(/\n/g, '\r\n')), readWorkflow(text));
});

test('the real gate workflow reads, and a block ends where its lines get shallower', () => {
  const workflow = readWorkflow(
    fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  assert.equal(workflow.name, 'Verify');
  assert.ok(Object.keys(workflow.jobs).length >= 6);
  for (const job of Object.values(workflow.jobs)) assert.ok(Array.isArray(job.steps));
  assert.deepEqual(readWorkflow('a:\n  b: |\n    one\n      two\n  c: 3\n'), {
    a: { b: 'one\n  two\n', c: 3 },
  });
});

test('anything outside the shape is refused with its line, not guessed', () => {
  const refused = {
    'a tab': 'a:\n\tb: 1\n',
    'a key twice': 'a: 1\na: 2\n',
    'a deeper line under a value': 'a: 1\n  b: 2\n',
    'a line deeper than its siblings': 'a:\n  b: 1\n   c: 2\n',
    'an anchor': 'a: &x 1\n',
    'an alias': 'a: *x\n',
    'a tag': 'a: !!str 1\n',
    'a folded block': 'a: >\n  text\n',
    'a stripped block': 'a: |-\n  text\n',
    'an empty block': 'a: |\nb: 1\n',
    'a flow mapping': 'a: {b: 1}\n',
    'a nested flow list': 'a: [[1], 2]\n',
    'an empty flow item': 'a: [1, , 2]\n',
    'an unclosed quote': "a: 'one\n",
    'a double quote with an escape': 'a: "\\n"\n',
    'a colon and space in a plain value': 'a: b: c\n',
    'a document marker': '---\na: 1\n',
    'a sequence at the depth of its key': 'a:\n- 1\n',
    'a lone dash': 'a:\n  -\n    b: 1\n',
    'a key among sequence items': 'a:\n  - 1\n  b: 2\n',
    'a line that is not a key': 'a: 1\njust words\n',
    'a key that is not a plain word': '"a": 1\n',
    'an indented start': '  a: 1\n',
    'nothing at all': '# only a comment\n',
  };
  for (const [name, text] of Object.entries(refused)) {
    assert.throws(() => readWorkflow(text), /^Error: workflow line \d+: /, name);
  }
});
