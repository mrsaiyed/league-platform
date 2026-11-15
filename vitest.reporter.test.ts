import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import ProveEveryResult, {
  everyFileFinishedWell,
  isProgressReportTimeout,
  missingFromVitest,
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
    seenFailing: [],
    modules: [{ name: 'a.test.ts', state: 'passed', errors: 0, tests: [passing('one')] }],
    ...over,
  });

  it('proves a run whose every file and test passed or was skipped', () => {
    expect(unprovenResults(facts())).toEqual([]);
    const skipped = { name: 'b.test.ts', state: 'skipped', errors: 0, tests: [] };
    expect(unprovenResults(facts({ modules: [...facts().modules, skipped] }))).toEqual([]);
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

  it('does not prove a run in which no test file reported', () => {
    expect(unprovenResults(facts({ modules: [] }))).toEqual(['no test file reported at all']);
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

describe('what the reporter needs from vitest', () => {
  const whole = () => ({
    version: '3.2.7',
    state: { catchError: () => {} },
    config: { root },
    _testRun: { end: async () => {} },
  });

  it('finds everything in the vitest it runs under', () => {
    expect(missingFromVitest(whole())).toEqual([]);
  });

  it('names each piece an upgrade took away, and refuses to start', () => {
    const noEnd = { ...whole(), _testRun: {} };
    expect(missingFromVitest({ ...noEnd, version: '4.0.0', state: {} })).toEqual([
      'vitest 3 (this is 4.0.0): its reporter hooks were checked on 3.2.7',
      'vitest.state.catchError',
      'vitest._testRun.end',
    ]);
    const reporter = new ProveEveryResult();
    expect(() => reporter.onInit(noEnd as never)).toThrow(/vitest\._testRun\.end/);
  });
});

describe('the reporter at the end of a run', () => {
  const exitCode = process.exitCode;
  // The reporter prints "this run FAILS"; caught here so a passing gate never shows it.
  const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => {
    process.exitCode = exitCode;
    printed.mockClear();
  });
  afterAll(() => {
    printed.mockRestore();
  });
  const said = () => printed.mock.calls.map((call) => String(call[0])).join('\n');

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

  it('fails a run vitest called passed when a test in it did not pass, and names it at once', () => {
    const reporter = new ProveEveryResult();
    reporter.onTestRunStart();
    process.exitCode = 0;
    reporter.onTestRunEnd([module('passed', [test('pending')])], [], 'passed');
    expect(process.exitCode).toBe(1);
    // Printed by onTestRunEnd itself, not left to a later hook.
    expect(said()).toContain('this run FAILS');
    expect(said()).toContain('a.test.ts > one: its result never arrived');
  });

  it('fails the run when a failed result arrives after the end', () => {
    const reporter = new ProveEveryResult();
    reporter.onTestRunStart();
    reporter.onTestRunEnd([module('passed', [test('passed')])], [], 'passed');
    process.exitCode = 0;
    reporter.onTestCaseResult(test('failed'));
    expect(process.exitCode).toBe(1);
    expect(said()).toContain(
      "this run FAILS. a.test.ts > one: failed, reported after the run's end",
    );
  });

  it('leaves a proven run alone', () => {
    const reporter = new ProveEveryResult();
    reporter.onTestRunStart();
    process.exitCode = 0;
    reporter.onTestRunEnd([module('passed', [test('passed')])], [], 'passed');
    expect(process.exitCode).toBe(0);
    expect(printed).not.toHaveBeenCalled();
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
  'also-passes.test.ts': `import { expect, it } from 'vitest';
it('also passes', () => expect(3).toBe(3));
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
  extra: ReadonlyArray<string> = [],
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
      [vitestBin, 'run', '--root', dir, '--config', join(dir, 'vitest.config.ts'), ...extra],
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

  // vitest alone already fails this run; it guards that the reporter never hides a failure.
  it('fails and names the test when nothing times out (the reporter hides nothing)', async () => {
    const run = await runChild('plain', ['fails.test.ts', 'passes.test.ts'], 'none', '');
    expect(run.code, run.output).toBe(1);
    expect(run.output).toContain('fails.test.ts > deliberately fails');
  });

  // The old reporter also exited 1 here: this guards the message naming the held timeout.
  it('names the held timeout when a failing test is answered late (wording; exit was always 1)', async () => {
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

  // The old reporter also exited 0 here: this guards the forgiving and the line that says why.
  it('says why it forgives timeouts in a run whose every result passed (wording; exit was always 0)', async () => {
    const run = await runChild('late-all', ['passes.test.ts'], 'late-all', 'all');
    expect(run.code, run.output).toBe(0);
    expect(run.output).toContain('but all 2 tests in 1 files reported a pass or a skip');
  });

  // With --shard vitest starts with every file but ends with the shard's only.
  it('passes a sharded run whose own files pass', async () => {
    const files = ['passes.test.ts', 'also-passes.test.ts'] as const;
    const run = await runChild('shard-pass', files, 'none', '', ['--shard=1/2']);
    expect(run.code, run.output).toBe(0);
    expect(run.output).not.toContain('this run FAILS');
  });

  it('fails the shard that holds the failing file, and only that one', async () => {
    const files = ['fails.test.ts', 'passes.test.ts'] as const;
    const runs = await Promise.all(
      ['1/2', '2/2'].map((shard, i) =>
        runChild(`shard-${i + 1}`, files, 'none', '', [`--shard=${shard}`]),
      ),
    );
    const failing = runs.filter((run) => run.output.includes('fails.test.ts > deliberately fails'));
    expect(failing, runs.map((run) => run.output).join('\n')).toHaveLength(1);
    expect(failing[0]?.code).toBe(1);
    const other = runs.find((run) => run !== failing[0]);
    expect(other?.code, other?.output).toBe(0);
    expect(other?.output).not.toContain('this run FAILS');
  });
});
