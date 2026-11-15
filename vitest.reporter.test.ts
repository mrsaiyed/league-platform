import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import ProveEveryResult, {
  everyFileFinishedWell,
  isProgressReportTimeout,
  unprovenResults,
  type ModuleView,
  type RunFacts,
  type TestView,
} from './vitest.reporter.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const reporterPath = join(root, 'vitest.reporter.ts');
const vitestBin = join(root, 'node_modules', 'vitest', 'vitest.mjs');
// Inside the repository (so the child finds vitest), in the git-ignored .local folder.
const scratch = join(root, '.local', `reporter-check-${process.pid}-${Date.now()}`);

describe('progress report timeouts', () => {
  it('recognizes only the onTaskUpdate timeout', () => {
    expect(
      isProgressReportTimeout(new Error('[vitest-worker]: Timeout calling "onTaskUpdate" with []')),
    ).toBe(true);
    expect(isProgressReportTimeout(new Error('something else'))).toBe(false);
    expect(isProgressReportTimeout(null)).toBe(false);
  });

  it('is ignored only when every file passed or was skipped', () => {
    expect(everyFileFinishedWell(['passed', 'skipped'], 'passed')).toBe(true);
    expect(everyFileFinishedWell(['passed', 'failed'], 'passed')).toBe(false);
    expect(everyFileFinishedWell(['passed', 'pending'], 'passed')).toBe(false);
    expect(everyFileFinishedWell([], 'passed')).toBe(false);
    expect(everyFileFinishedWell(['passed'], 'failed')).toBe(false);
    expect(everyFileFinishedWell(['passed'], 'interrupted')).toBe(false);
  });
});

describe('what the run must prove before it passes', () => {
  const passing = (name: string) => ({ name, state: 'passed' });
  const facts = (over: Partial<RunFacts> = {}): RunFacts => ({
    reason: 'passed',
    scheduled: 1,
    seenFailing: [],
    modules: [{ name: 'a.test.ts', state: 'passed', errors: 0, tests: [passing('one')] }],
    ...over,
  });

  it('proves a run whose every file and test passed or was skipped', () => {
    expect(unprovenResults(facts())).toEqual([]);
    const skipped = { name: 'b.test.ts', state: 'skipped', errors: 0, tests: [] };
    expect(
      unprovenResults(facts({ scheduled: 2, modules: [...facts().modules, skipped] })),
    ).toEqual([]);
  });

  it('names a failed test even when its file and the run say passed', () => {
    const modules = [
      { name: 'a.test.ts', state: 'passed', errors: 0, tests: [{ name: 'one', state: 'failed' }] },
    ];
    expect(unprovenResults(facts({ modules }))).toEqual(['a.test.ts > one: failed']);
  });

  it('names a file or test whose result never arrived', () => {
    const modules = [
      {
        name: 'a.test.ts',
        state: 'pending',
        errors: 0,
        tests: [{ name: 'one', state: 'pending' }],
      },
    ];
    expect(unprovenResults(facts({ modules }))).toEqual([
      'a.test.ts: its result never arrived (vitest last heard "pending")',
      'a.test.ts > one: its result never arrived (vitest last heard "pending")',
    ]);
  });

  it('counts the files the run set out to run against the files that reported', () => {
    expect(unprovenResults(facts({ scheduled: 3 }))).toEqual([
      '2 of 3 test files never reported at all',
    ]);
  });

  it('remembers a test reported failed on the way, even if a later report says otherwise', () => {
    expect(unprovenResults(facts({ seenFailing: ['a.test.ts > one'] }))).toEqual([
      'a.test.ts > one: was reported failed during the run, though not at its end',
    ]);
  });

  it('does not prove a run that ended other than passed, or a file with errors', () => {
    const modules = [{ name: 'a.test.ts', state: 'passed', errors: 1, tests: [passing('one')] }];
    expect(unprovenResults(facts({ reason: 'interrupted', modules }))).toEqual([
      'the run ended as "interrupted"',
      'a.test.ts: 1 error(s) outside its tests',
    ]);
  });
});

describe('the reporter at the end of a run', () => {
  const exitCode = process.exitCode;
  afterEach(() => {
    process.exitCode = exitCode;
  });

  const test = (state: string): TestView => ({
    fullName: 'one',
    module: { moduleId: `${root}a.test.ts` },
    result: () => ({ state }),
  });
  const module = (state: string, tests: TestView[]): ModuleView => ({
    moduleId: `${root}a.test.ts`,
    state: () => state,
    errors: () => [],
    children: { allTests: () => tests },
  });

  it('fails a run vitest called passed when a test in it did not pass', () => {
    const reporter = new ProveEveryResult();
    reporter.onTestRunStart([{}]);
    process.exitCode = 0;
    reporter.onTestRunEnd([module('passed', [test('pending')])], [], 'passed');
    expect(process.exitCode).toBe(1);
  });

  it('fails the run when a failed result arrives after the end', () => {
    const reporter = new ProveEveryResult();
    reporter.onTestRunStart([{}]);
    reporter.onTestRunEnd([module('passed', [test('passed')])], [], 'passed');
    process.exitCode = 0;
    reporter.onTestCaseResult(test('failed'));
    expect(process.exitCode).toBe(1);
  });

  it('leaves a proven run alone', () => {
    const reporter = new ProveEveryResult();
    reporter.onTestRunStart([{}]);
    process.exitCode = 0;
    reporter.onTestRunEnd([module('passed', [test('passed')])], [], 'passed');
    expect(process.exitCode).toBe(0);
  });
});

// The done test of step 2.145: vitest run as a child on a temporary folder, with a test that
// fails on purpose, and the progress report timing out. vitest's own limit is 60 seconds and
// cannot be changed, so a setup file in the child's worker makes the report time out the same
// way, sooner: "late" answers it late (what a crowded computer does), "lost" never sends it
// (the worst case, which the reporter cannot see and must not call a pass).
const children = {
  'fails.test.ts': `import { expect, it } from 'vitest';
it('passes first', () => expect(1).toBe(1));
it('deliberately fails', () => expect(200).toBe(404));
it('passes after', () => expect(1).toBe(1));
`,
  'passes.test.ts': `import { expect, it } from 'vitest';
it('just passes', () => expect(1).toBe(1));
it('passes too', () => expect(2).toBe(2));
`,
  'report-timeout.setup.ts': `type Pack = [string, { state?: string } | undefined, unknown];
type Rpc = { onTaskUpdate: (packs: Pack[], events: unknown[]) => Promise<void> };
const mode = process.env.REPORTER_CHECK_MODE ?? 'none';
const state = (globalThis as unknown as { __vitest_worker__: { rpc: Rpc } }).__vitest_worker__;
const real = state.rpc;
const timeout = () => new Error('[vitest-worker]: Timeout calling "onTaskUpdate"');
state.rpc = new Proxy(real, {
  get(target, key, receiver) {
    if (key !== 'onTaskUpdate' || mode === 'none') return Reflect.get(target, key, receiver);
    return (packs: Pack[], events: unknown[]) => {
      const carriesFailure = packs.some(([, result]) => result?.state === 'fail');
      if (mode !== 'late-all' && !carriesFailure) return target.onTaskUpdate(packs, events);
      if (mode === 'lost') return Promise.reject(timeout());
      const sent = target.onTaskUpdate(packs, events);
      return Promise.race([sent, new Promise<void>((_, no) => setTimeout(() => no(timeout()), 300))]);
    };
  },
});
`,
  'slow-main.ts': `// Keeps the main process from answering a progress report for a while.
const on = process.env.REPORTER_CHECK_SLOW ?? '';
export default class SlowMain {
  async onTestCaseResult(test: { result: () => { state: string } }) {
    if (on === 'all' || (on === 'failed' && test.result().state === 'failed')) {
      await new Promise((done) => setTimeout(done, 1500));
    }
  }
}
`,
};

type Child = { code: number | null; output: string };

async function runChild(
  name: string,
  files: ReadonlyArray<keyof typeof children>,
  mode: string,
  slow: string,
): Promise<Child> {
  const dir = join(scratch, name);
  await mkdir(dir, { recursive: true });
  for (const file of files) await writeFile(join(dir, file), children[file]);
  await writeFile(join(dir, 'report-timeout.setup.ts'), children['report-timeout.setup.ts']);
  await writeFile(join(dir, 'slow-main.ts'), children['slow-main.ts']);
  await writeFile(
    join(dir, 'vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['*.test.ts'],
    setupFiles: ['./report-timeout.setup.ts'],
    reporters: ['default', ${JSON.stringify(reporterPath.split('\\').join('/'))}, './slow-main.ts'],
  },
});
`,
  );
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(VITEST|TINYPOOL)/.test(key)) env[key] = value;
  }
  Object.assign(env, {
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    REPORTER_CHECK_MODE: mode,
    REPORTER_CHECK_SLOW: slow,
  });
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [vitestBin, 'run', '--root', dir, '--config', join(dir, 'vitest.config.ts')],
      // Started from the repository root, so no process keeps the folder busy on Windows.
      { cwd: root, env },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

describe('a run with a test that fails on purpose (vitest as a child)', () => {
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    expect(existsSync(scratch)).toBe(false);
  });

  it('fails and names the test when nothing times out', async () => {
    const run = await runChild('plain', ['fails.test.ts', 'passes.test.ts'], 'none', '');
    expect(run.code, run.output).toBe(1);
    expect(run.output).toContain('fails.test.ts > deliberately fails');
  });

  it('fails and names the test when its progress report times out and arrives late', async () => {
    const run = await runChild('late', ['fails.test.ts', 'passes.test.ts'], 'late', 'failed');
    expect(run.code, run.output).toBe(1);
    expect(run.output).toContain('Timeout calling "onTaskUpdate"');
    expect(run.output).toContain('fails.test.ts > deliberately fails');
  });

  it('fails and names the test when its progress report times out and never arrives', async () => {
    const run = await runChild('lost', ['fails.test.ts', 'passes.test.ts'], 'lost', '');
    expect(run.code, run.output).toBe(1);
    expect(run.output).toContain('this run FAILS');
    expect(run.output).toContain(
      'fails.test.ts > deliberately fails: its result never arrived (vitest last heard "pending")',
    );
  });

  it('still passes a run whose reports time out but every result arrives as a pass', async () => {
    const run = await runChild('late-all', ['passes.test.ts'], 'late-all', 'all');
    expect(run.code, run.output).toBe(0);
    expect(run.output).toContain('but all 2 tests in 1 files reported a pass or a skip');
  });
});
