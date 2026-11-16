// GitHub's gate (.github/workflows/ci.yml, step 2.191) runs as several jobs side by side.
// These checks keep it whole. The workflow is read as GitHub reads it
// (scripts/workflow-reader.mjs), and only the bodies of the steps' `run:` count as run, never a
// step's name or a comment. The rules:
//   - every part of `npm run verify` and every test script of package.json is run, whole, by
//     a step that always runs;
//   - no step's failure can be swallowed: no `continue-on-error`, no `||`, no `; true`, no
//     `set +e`, a pipe only after `set -o pipefail`, and no condition on a job or a step except
//     the "say what failed" steps' own `if: failure()…`;
//   - each matrix is 1 to n and the command is given GitHub's job-total, and the web browser
//     groups together hold every test once;
//   - no job waits on another, each starts as the single job did, hosted-build is there with
//     its steps, and the workflow never becomes one that reaches the live tracker.
// Each rule is proved by a copy of the real workflow with a fault put in (the faults below),
// which must fail it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { reachesLiveSite } from '../scripts/promote-rules.mjs';
import { browserChain } from '../scripts/web-browser-chain.mjs';
import { readWorkflow } from '../scripts/workflow-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = '.github/workflows/ci.yml';
const real = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;

const jobIds = [
  'checks',
  'node-tests',
  'vitest-tests',
  'web-shell',
  'tracker-browser',
  'web-browser',
  'hosted-build',
];
const jobKeys = ['name', 'runs-on', 'strategy', 'steps'];
const stepKeys = ['name', 'id', 'uses', 'with', 'run', 'shell', 'if', 'working-directory'];
const checkout = { uses: 'actions/checkout@v4' };
const setupNode = { uses: 'actions/setup-node@v4', with: { 'node-version': '24', cache: 'npm' } };
const npmCi = { run: 'npm ci' };
const hostedBuild = [
  checkout,
  {
    uses: 'actions/setup-node@v4',
    with: {
      'node-version': '24',
      cache: 'npm',
      'cache-dependency-path': 'apps/varsity-hosted/package-lock.json',
    },
  },
  npmCi,
  { run: 'npm run prepare:varsity:hosted' },
  { run: 'npm --prefix apps/varsity-hosted ci' },
  {
    run: 'node node_modules/typescript/bin/tsc --noEmit',
    'working-directory': 'apps/varsity-hosted',
  },
  { run: 'npm run build', 'working-directory': 'apps/varsity-hosted' },
];
/** The two commands that run a part: in which job, by which matrix dimension, with what. */
const parts = {
  'npm run test:units': {
    job: 'vitest-tests',
    dimension: 'shard',
    arg: '--shard=${{ matrix.shard }}/${{ strategy.job-total }}',
  },
  'npm run test:web:browser': {
    job: 'web-browser',
    dimension: 'group',
    arg: '--group=${{ matrix.group }}/${{ strategy.job-total }}',
  },
};
/** A "say what failed" step: it only reads a run's kept output. */
const notesStep =
  /^node scripts\/(?:verify|browser)-failure-notes\.mjs "\$RUNNER_TEMP\/[\w-]+\.txt"$/;
const notesCondition = /^failure\(\)(?: && steps\.([\w-]+)\.outcome == 'failure')?$/;

/** A shell body's simple commands, without comments, `env` and leading NAME=value words. */
const commandsOf = (body) =>
  body
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .split(/\|\||&&|[;|()\n]/)
    .map((piece) =>
      piece
        .trim()
        .replace(/^env +/, '')
        .replace(/^(?:[A-Za-z_]\w*=\S* +)+/, ''),
    )
    .filter(Boolean);

/** What is wrong with a copy of the gate workflow, as sentences; [] when nothing is. */
function gateProblems(text) {
  const problems = [];
  const say = (why) => problems.push(why);
  let workflow;
  try {
    workflow = readWorkflow(text);
  } catch (error) {
    return [error.message];
  }
  if (!isDeepStrictEqual(Object.keys(workflow), ['name', 'on', 'permissions', 'env', 'jobs'])) {
    say(`the workflow's own keys are ${Object.keys(workflow).join(', ')}`);
  }
  if (workflow.name !== 'Verify') say('the workflow is not named Verify');
  if (!isDeepStrictEqual(workflow.on, ['push', 'pull_request']))
    say('not on push and pull_request');
  if (!isDeepStrictEqual(workflow.permissions, { contents: 'read' }))
    say('more than contents: read');
  if (!isDeepStrictEqual(workflow.env, { NEXT_TELEMETRY_DISABLED: '1' })) say('other env');
  if (reachesLiveSite(file, text)) say('the workflow reaches the live tracker');
  if (/secrets\./.test(JSON.stringify(workflow))) say('the workflow uses a secret');

  const jobs = workflow.jobs ?? {};
  for (const id of jobIds) if (!Object.hasOwn(jobs, id)) say(`the job ${id} is missing`);
  if (jobs['hosted-build'] && !isDeepStrictEqual(jobs['hosted-build'].steps, hostedBuild)) {
    say('hosted-build does not have its steps');
  }

  /** The simple commands of the steps that always run, with their job. */
  const gate = [];
  for (const [id, job] of Object.entries(jobs)) {
    for (const key of Object.keys(job)) {
      if (key === 'if') say(`${id} has a condition of its own, so it can be skipped`);
      else if (key === 'needs') say(`${id} waits on another job, so it can be skipped`);
      else if (key === 'continue-on-error') say(`${id} has continue-on-error`);
      else if (!jobKeys.includes(key)) say(`${id} has the key ${key}`);
    }
    if (job['runs-on'] !== 'ubuntu-latest') say(`${id} does not run on ubuntu-latest`);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    if (steps.length === 0) say(`${id} has no steps`);
    if (!isDeepStrictEqual(steps[0], checkout)) say(`${id} does not start with the checkout`);
    if (
      steps[1]?.uses !== setupNode.uses ||
      steps[1]?.with?.['node-version'] !== '24' ||
      steps[1]?.with?.cache !== 'npm'
    ) {
      say(`${id} does not set up Node 24 with npm's cache`);
    }
    if (!isDeepStrictEqual(steps[2], npmCi)) say(`${id} does not run npm ci third`);
    const ids = [];
    let install = -1;
    let browser = -1;
    steps.forEach((step, place) => {
      if (typeof step !== 'object' || step === null) return say(`${id}: ${step} is not a step`);
      const label = `${id}: the step "${step.name ?? step.run ?? step.uses}"`;
      for (const key of Object.keys(step)) {
        if (key === 'continue-on-error') say(`${label} has continue-on-error`);
        else if (!stepKeys.includes(key)) say(`${label} has the key ${key}`);
      }
      if (step.uses && ![checkout.uses, setupNode.uses].includes(step.uses)) {
        say(`${label} uses an action the gate never used`);
      }
      if ('shell' in step && step.shell !== 'bash') say(`${label} has a shell other than bash`);
      const notes = typeof step.run === 'string' && notesStep.test(step.run.trim());
      if ('if' in step) {
        const condition = notesCondition.exec(String(step.if));
        if (!notes) say(`${label} has a condition, so it can be skipped`);
        else if (!condition) say(`${label} has a condition other than failure()`);
        else if (condition[1] && !ids.includes(condition[1])) say(`${label} names no step before`);
      } else if (notes) {
        say(`${label} says what failed but has no if: failure()`);
      }
      if (step.id) ids.push(step.id);
      if (typeof step.run !== 'string') return;
      const body = step.run;
      const commands = commandsOf(body);
      if (/\|\|/.test(body)) say(`${label} can swallow a failure with ||`);
      if (/(?<![&>])&(?![&>])/.test(body)) say(`${label} sends a command to the background`);
      for (const command of commands) {
        if (/^(?:true\b|:(?:\s|$)|!|exit\b|set +\+|trap\b)/.test(command)) {
          say(`${label} can swallow a failure with "${command}"`);
        }
      }
      const lines = body.split('\n').filter((line) => line.trim() && !/^\s*#/.test(line));
      if (/(?<!\|)\|(?!\|)/.test(body) && lines[0] !== 'set -o pipefail') {
        say(`${label} pipes without set -o pipefail first, so the pipe hides a failure`);
      }
      if (commands.includes('npx playwright install --with-deps chromium') && install < 0) {
        install = place;
      }
      if (commands.some((command) => /^npm run test:[\w:]*browser\b/.test(command))) {
        if (browser < 0) browser = place;
      }
      if (!('if' in step) && !('working-directory' in step)) {
        for (const command of commands) gate.push({ job: id, command });
      }
    });
    if (browser >= 0 && !(install >= 0 && install < browser)) {
      say(`${id} opens a browser before it installs one`);
    }

    // A matrix: 1 to n, with fail-fast off.
    const split = Object.values(parts).find((part) => part.job === id);
    if (!split) {
      if ('strategy' in job) say(`${id} has a matrix`);
      if (/matrix|--shard|--group/.test(JSON.stringify(steps))) say(`${id} runs a part`);
      continue;
    }
    const strategy = job.strategy ?? {};
    const matrix = strategy.matrix ?? {};
    if (!isDeepStrictEqual(Object.keys(strategy), ['fail-fast', 'matrix'])) {
      say(`${id}'s strategy is not just fail-fast and matrix`);
    }
    if (strategy['fail-fast'] !== false) say(`${id} does not have fail-fast: false`);
    const values = Array.isArray(matrix[split.dimension]) ? matrix[split.dimension] : [];
    const n = values.length;
    if (
      n < 2 ||
      !isDeepStrictEqual(
        values,
        Array.from({ length: n }, (_, k) => k + 1),
      )
    ) {
      say(`${id}'s ${split.dimension}s are not 1 to n`);
    }
  }

  /** Whether a step that always runs runs `npm`, whole (or as the matrix part it is). */
  const runs = (npm) =>
    gate.some(({ job, command }) => {
      const whole = command === npm || command === `${npm} 2>&1`;
      const part = parts[npm];
      const asPart =
        part !== undefined &&
        job === part.job &&
        (command === `${npm} -- ${part.arg}` || command === `${npm} -- ${part.arg} 2>&1`);
      return whole || asPart;
    });
  const verify = scripts.verify.split('&&').map((part) => part.trim());
  if (verify.length < 7) say(`verify has only ${verify.length} parts`);
  for (const part of verify) if (!runs(part)) say(`${part} is in verify but no job runs it`);
  const tests = Object.keys(scripts).filter((name) => name === 'test' || name.startsWith('test:'));
  for (const name of tests) {
    const npm = name === 'test' ? 'npm test' : `npm run ${name}`;
    if (!runs(npm)) say(`${npm} is a test script but no job runs it`);
  }
  return problems;
}

/** The real workflow with `from` (which must be in it) changed to `to`. */
const put = (text, from, to) => {
  assert.ok(text.includes(from), `the fault's text is in the workflow: ${from}`);
  return text.replace(from, to);
};
const step = (name) => `      - name: ${name}\n`;
const removedCommands = {
  'npm run check': ['(npm run check && npm run typecheck', '(npm run typecheck'],
  'npm test': ['          npm test 2>&1', '          echo 2>&1'],
  'npm run test:web': ['          npm run test:web 2>&1', '          echo 2>&1'],
  'npm run test:stats:browser': [
    'npm_config_script_shell=bash npm run test:stats:browser 2>&1',
    'npm_config_script_shell=bash echo 2>&1',
  ],
};
const npmTestLine = 'npm test 2>&1 | tee "$RUNNER_TEMP/verify-output.txt"';
const hostedFrom = real.indexOf('  hosted-build:\n');

/** Each fault, and the rule it must fail. */
const faults = {
  'four commands gone from their run: lines, their names kept': [
    Object.values(removedCommands).reduce((text, [from, to]) => put(text, from, to), real),
    /npm run check is in verify[\s\S]*npm test is in verify[\s\S]*npm run test:web is in verify[\s\S]*npm run test:stats:browser is a test script/,
  ],
  ...Object.fromEntries(
    Object.entries(removedCommands).map(([npm, [from, to]]) => [
      `${npm} gone from its run: line`,
      [put(real, from, to), new RegExp(`^${npm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is `, 'm')],
    ]),
  ),
  'npm test only in a shell comment': [
    put(real, `          ${npmTestLine}`, `          # ${npmTestLine}`),
    /npm test is in verify/,
  ],
  'npm test only echoed': [put(real, npmTestLine, `echo ${npmTestLine}`), /npm test is in verify/],
  'npm test narrowed to one file': [
    put(real, 'npm test 2>&1', 'npm test -- tests/ci-workflow.test.mjs 2>&1'),
    /npm test is in verify/,
  ],
  'a step-level if: false on the npm test step': [
    put(real, step('npm test'), `${step('npm test')}        if: false\n`),
    /node-tests: the step "npm test" has a condition/,
  ],
  'the npm test step behind if: failure()': [
    put(real, step('npm test'), `${step('npm test')}        if: failure()\n`),
    /node-tests: the step "npm test" has a condition/,
  ],
  'a condition on a step without a name': [
    put(
      real,
      '      - run: npm run test:browser\n',
      "      - run: npm run test:browser\n        if: github.ref == 'refs/heads/main'\n",
    ),
    /the step "npm run test:browser" has a condition/,
  ],
  'a job-level if': [
    put(real, '    name: unit tests (node)\n', '    name: unit tests (node)\n    if: false\n'),
    /node-tests has a condition of its own/,
  ],
  'a job that needs another': [
    put(real, '    name: web shell check\n', '    name: web shell check\n    needs: checks\n'),
    /web-shell waits on another job/,
  ],
  'continue-on-error: true on a step': [
    put(real, step('npm test'), `${step('npm test')}        continue-on-error: true\n`),
    /the step "npm test" has continue-on-error/,
  ],
  'continue-on-error: true on a job': [
    put(
      real,
      '    name: web shell check\n',
      '    name: web shell check\n    continue-on-error: true\n',
    ),
    /web-shell has continue-on-error/,
  ],
  'npm test || true': [
    put(real, 'npm test 2>&1', 'npm test || true 2>&1'),
    /the step "npm test" can swallow a failure with \|\|/,
  ],
  'a pipe || true': [put(real, npmTestLine, `${npmTestLine} || true`), /can swallow a failure/],
  'npm test || :': [put(real, npmTestLine, `${npmTestLine} || :`), /can swallow a failure/],
  'npm test; true': [
    put(real, npmTestLine, `${npmTestLine}; true`),
    /the step "npm test" can swallow a failure with "true"/,
  ],
  'npm test; exit 0': [put(real, npmTestLine, `${npmTestLine}; exit 0`), /"exit 0"/],
  'set +e before the checks': [
    put(
      real,
      '          set -o pipefail\n          (npm run check',
      '          set +e\n          set -o pipefail\n          (npm run check',
    ),
    /"set \+e"/,
  ],
  'set +o pipefail after set -o pipefail': [
    put(
      real,
      '          set -o pipefail\n          npm test',
      '          set -o pipefail\n          set +o pipefail\n          npm test',
    ),
    /"set \+o pipefail"/,
  ],
  'no set -o pipefail before the pipe to tee': [
    put(real, '          set -o pipefail\n          npm test', '          npm test'),
    /the step "npm test" pipes without set -o pipefail/,
  ],
  'npm test sent to the background': [
    put(real, 'npm test 2>&1', 'npm test & 2>&1'),
    /sends a command to the background/,
  ],
  'a shell without bash -e': [
    put(
      real,
      `${step('npm test')}        shell: bash\n`,
      `${step('npm test')}        shell: bash {0}\n`,
    ),
    /the step "npm test" has a shell other than bash/,
  ],
  'npm test in another folder': [
    put(
      real,
      `${step('npm test')}        shell: bash\n`,
      `${step('npm test')}        shell: bash\n        working-directory: apps/web\n`,
    ),
    /npm test is in verify/,
  ],
  'a "say what failed" step that always runs': [
    put(
      real,
      '        if: failure()\n        shell: bash\n        run: node scripts/verify',
      '        if: always()\n        shell: bash\n        run: node scripts/verify',
    ),
    /has a condition other than failure\(\)/,
  ],
  'the hosted-build job deleted': [real.slice(0, hostedFrom), /the job hosted-build is missing/],
  'a step of hosted-build deleted': [
    put(real, '      - run: npm run build\n        working-directory: apps/varsity-hosted\n', ''),
    /hosted-build does not have its steps/,
  ],
  'web groups that are not 1 to n': [
    put(real, '        group: [1, 2, 3]\n', '        group: [1, 2, 2]\n'),
    /web-browser's groups are not 1 to n/,
  ],
  'vitest shards that are not 1 to n': [
    put(real, '        shard: [1, 2, 3]\n', '        shard: [1, 3]\n'),
    /vitest-tests's shards are not 1 to n/,
  ],
  'the web groups with fail-fast on': [
    put(
      real,
      '      fail-fast: false\n      matrix:\n        group',
      '      fail-fast: true\n      matrix:\n        group',
    ),
    /web-browser does not have fail-fast: false/,
  ],
  'the group count written in, not taken from the matrix': [
    put(
      real,
      '--group=${{ matrix.group }}/${{ strategy.job-total }}',
      '--group=${{ matrix.group }}/3',
    ),
    /npm run test:web:browser is a test script but no job runs it/,
  ],
  'a part run in a job without its matrix': [
    put(
      real,
      '          npm test 2>&1',
      '          npm test 2>&1 && npm run test:units -- --shard=1/3',
    ),
    /node-tests runs a part/,
  ],
  'the browser installed after a browser test': [
    put(
      real,
      '      - run: npx playwright install --with-deps chromium\n      - run: npm run test:browser\n',
      '      - run: npm run test:browser\n      - run: npx playwright install --with-deps chromium\n',
    ),
    /tracker-browser opens a browser before it installs one/,
  ],
  'a new action': [
    put(
      real,
      '      - uses: actions/checkout@v4\n',
      '      - uses: actions/checkout@v4\n      - uses: actions/cache@v4\n',
    ),
    /uses an action the gate never used/,
  ],
  'a job that skips npm ci': [
    put(
      real,
      '          cache: npm\n      - run: npm ci\n      - name: npm run check',
      '          cache: npm\n      - name: npm run check',
    ),
    /checks does not run npm ci third/,
  ],
  'more permissions': [
    put(real, '  contents: read\n', '  contents: write\n'),
    /more than contents/,
  ],
  'other events': [
    put(real, 'on: [push, pull_request]', 'on: [push]'),
    /not on push and pull_request/,
  ],
  'a secret': [
    put(
      real,
      "  NEXT_TELEMETRY_DISABLED: '1'\n",
      "  NEXT_TELEMETRY_DISABLED: '1'\n  TOKEN: ${{ secrets.TOKEN }}\n",
    ),
    /uses a secret/,
  ],
  'a deploy': [
    put(
      real,
      '      - run: npm run build\n',
      '      - run: npm run build\n      - uses: actions/deploy-pages@v4\n',
    ),
    /reaches the live tracker/,
  ],
  'a shape the reader does not read': [
    put(real, 'name: Verify', 'name: &a Verify'),
    /^workflow line 1: /,
  ],
};

test('the real gate workflow keeps every rule', () => {
  assert.deepEqual(gateProblems(real), []);
});

for (const [name, [text, rule]] of Object.entries(faults)) {
  test(`a fault fails the rules: ${name}`, () => {
    assert.notEqual(text, real);
    const problems = gateProblems(text);
    assert.ok(problems.length > 0, `${name}: the rules found nothing wrong`);
    assert.match(problems.join('\n'), rule);
  });
}

test('the web browser groups together hold every browser test, each once', () => {
  const workflow = readWorkflow(real);
  const groups = workflow.jobs['web-browser'].strategy.matrix.group;
  const n = groups.length;
  const folder = path.join(root, 'tests/browser');
  const names = fs.readdirSync(folder);
  const read = (name) => fs.readFileSync(path.join(folder, name), 'utf8');
  const whole = browserChain(names, read).map((t) => t.file);
  const together = groups.flatMap((k) =>
    browserChain(names, read, [], 'tests/browser', { k, n }).map((t) => t.file),
  );
  assert.deepEqual([...together].sort(), [...whole].sort());
  assert.equal(new Set(together).size, together.length);
  for (const k of groups) {
    assert.ok(browserChain(names, read, [], 'tests/browser', { k, n }).length > 0, `group ${k}`);
  }
});

test('a step counts as run only by its run: body, never by its name or a comment', () => {
  assert.deepEqual(commandsOf('set -o pipefail\n# npm test\n(npm run a && b) 2>&1 | tee x\n'), [
    'set -o pipefail',
    'npm run a',
    'b',
    '2>&1',
    'tee x',
  ]);
  assert.deepEqual(commandsOf('env A=1 b=2 npm run c -- --d=1/2 2>&1 | tee y'), [
    'npm run c -- --d=1/2 2>&1',
    'tee y',
  ]);
});
