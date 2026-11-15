// A reporter that makes sure the run never passes a result it has not seen pass (step 2.145).
//
// It forgives one kind of vitest error: "Timeout calling onTaskUpdate", the 60-second limit
// vitest puts on a test worker's progress report to the main process. When a computer is
// crowded (several runs of the gate at once, see docs/build/RUNBOOK.md), a report's answer
// can come a minute late although every test went on to pass, and vitest then exits 1.
//
// Such a timeout is held back while the run goes on. At the end it is forgiven only when the
// run proves that every result arrived: every test file vitest ran, and every test in it,
// finished as passed or skipped, and no test was ever reported failed on the way. Otherwise
// the run fails (exit code 1) and the held errors and every unproven result are printed by
// name. A failed result that arrives after the end also fails the run.
//
// Why the proof is needed: vitest counts a file whose results never arrived as "not failed",
// so a lost report of a failed test leaves nothing failed in vitest's own count, and the held
// timeout was the only thing that would have failed the run. Before 2.145 the reporter "put
// back" the held error in onTestRunEnd, after vitest had already counted errors and chosen the
// exit code, so putting it back did nothing and such a run exited 0.
//
// A file whose worker never reported still appears at the end (vitest registers a stand-in
// for each file before running it) and is caught as pending. Files are not counted against
// the run's start: with --shard the start lists every file, the end only the shard's.
//
// Even with no timeout, the same proof is applied: a run vitest calls passed that holds a
// failed or unfinished test still fails. Every other unhandled error fails the run at once,
// as vitest does.
import type { Vitest } from 'vitest/node';

const progressReportTimeout = /\[vitest-worker\]: Timeout calling "onTaskUpdate"/;
const finishedWell = new Set(['passed', 'skipped']);

type ErrorState = { catchError: (error: unknown, type: string) => void };
type Held = { error: unknown; type: string };

/** What the reporter reads of a test (vitest's TestCase). */
export type TestView = {
  fullName: string;
  module: { moduleId: string };
  result: () => { state: string };
};

/** What the reporter reads of a test file (vitest's TestModule). */
export type ModuleView = {
  moduleId: string;
  state: () => string;
  errors: () => ReadonlyArray<unknown>;
  children: { allTests: () => Iterable<TestView> };
};

/** The facts the end-of-run check rests on, read from vitest and from the run's events. */
export type RunFacts = {
  reason: string;
  /** Each test file vitest knows at the end of the run, with its tests. */
  modules: ReadonlyArray<{ name: string; state: string; errors: number; tests: TestFacts[] }>;
  /** Tests that some event during the run reported as failed, as "file > test". */
  seenFailing: ReadonlyArray<string>;
};
export type TestFacts = { name: string; state: string };

export function isProgressReportTimeout(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && progressReportTimeout.test(message);
}

/**
 * Every result the run cannot prove passed, one plain line each. Empty only when the run
 * ended as passed with at least one file, every file and test in it finished as passed or
 * skipped, and no test was reported failed along the way.
 */
export function unprovenResults(facts: RunFacts): string[] {
  const problems: string[] = [];
  if (facts.reason !== 'passed') problems.push(`the run ended as "${facts.reason}"`);
  if (facts.modules.length === 0) problems.push('no test file reported at all');
  for (const module of facts.modules) {
    if (!finishedWell.has(module.state)) {
      problems.push(`${module.name}: ${describeState(module.state)}`);
    }
    if (module.errors > 0) {
      problems.push(`${module.name}: ${module.errors} error(s) outside its tests`);
    }
    for (const test of module.tests) {
      if (!finishedWell.has(test.state)) {
        problems.push(`${module.name} > ${test.name}: ${describeState(test.state)}`);
      }
    }
  }
  const failedAtEnd = new Set(
    facts.modules.flatMap((module) =>
      module.tests.filter((t) => t.state === 'failed').map((t) => `${module.name} > ${t.name}`),
    ),
  );
  for (const name of facts.seenFailing) {
    if (!failedAtEnd.has(name)) {
      problems.push(`${name}: was reported failed during the run, though not at its end`);
    }
  }
  return problems;
}

/** The old per-file check, kept for its tests: true only when all files passed or skipped. */
export function everyFileFinishedWell(states: ReadonlyArray<string>, reason: string): boolean {
  return reason === 'passed' && states.length > 0 && states.every((s) => finishedWell.has(s));
}

/** Reads the facts out of vitest's test modules. */
export function factsOf(
  modules: ReadonlyArray<ModuleView>,
  reason: string,
  seenFailing: ReadonlyArray<string>,
  root: string,
): RunFacts {
  return {
    reason,
    seenFailing,
    modules: modules.map((module) => ({
      name: shortName(module.moduleId, root),
      state: module.state(),
      errors: module.errors().length,
      tests: Array.from(module.children.allTests(), (test) => ({
        name: test.fullName,
        state: test.result().state,
      })),
    })),
  };
}

function describeState(state: string): string {
  if (state === 'failed') return 'failed';
  if (state === 'pending' || state === 'queued') {
    return `its result never arrived (vitest last heard "${state}")`;
  }
  return `finished as "${state}"`;
}

function shortName(moduleId: string, root: string): string {
  const id = moduleId.split('\\').join('/');
  const base = root.split('\\').join('/').replace(/\/?$/, '/');
  return id.startsWith(base) ? id.slice(base.length) : id;
}

/**
 * What this reporter relies on in vitest, checked when vitest starts it. Checked against
 * vitest 3.2.7: an upgrade that drops any of it must fail loudly, never pass quietly.
 */
export function missingFromVitest(vitest: unknown): string[] {
  const v = vitest as {
    version?: unknown;
    state?: { catchError?: unknown };
    config?: { root?: unknown };
    _testRun?: { end?: unknown };
  } | null;
  const missing: string[] = [];
  const major = typeof v?.version === 'string' ? v.version.split('.')[0] : undefined;
  if (major !== '3') {
    missing.push(
      `vitest 3 (this is ${String(v?.version)}): its reporter hooks were checked on 3.2.7`,
    );
  }
  if (typeof v?.state?.catchError !== 'function') missing.push('vitest.state.catchError');
  if (typeof v?.config?.root !== 'string') missing.push('vitest.config.root');
  // Its end() calls onTestRunEnd after choosing the exit code (see the comment above).
  if (typeof v?._testRun?.end !== 'function') missing.push('vitest._testRun.end');
  return missing;
}

export default class ProveEveryResult {
  private held: Held[] = [];
  private seenFailing = new Set<string>();
  private ended = false;
  private vitest: Vitest | undefined;

  onInit(vitest: Vitest): void {
    const missing = missingFromVitest(vitest);
    if (missing.length > 0) {
      throw new Error(
        `vitest.reporter.ts: this vitest lacks what the reporter relies on (${missing.join('; ')}). Update the reporter before upgrading vitest.`,
      );
    }
    this.vitest = vitest;
    const state = vitest.state as unknown as ErrorState;
    const record = state.catchError.bind(state);
    state.catchError = (error, type) => {
      if (isProgressReportTimeout(error) && !this.ended) {
        console.warn(
          "Note: a test worker's progress report to vitest timed out on a busy computer; it is forgiven only if every test's result is seen to pass.",
        );
        this.held.push({ error, type });
        return;
      }
      record(error, type);
    };
  }

  onTestRunStart(): void {
    this.held = [];
    this.seenFailing.clear();
    this.ended = false;
  }

  onTestCaseResult(test: TestView): void {
    if (test.result().state !== 'failed') return;
    const name = `${shortName(test.module.moduleId, this.root())} > ${test.fullName}`;
    this.seenFailing.add(name);
    if (this.ended) this.failLate(`${name}: failed, reported after the run's end`);
  }

  onTestModuleEnd(module: ModuleView): void {
    if (this.ended && module.state() === 'failed') {
      this.failLate(
        `${shortName(module.moduleId, this.root())}: failed, reported after the run's end`,
      );
    }
  }

  onTestRunEnd(
    testModules: ReadonlyArray<ModuleView>,
    _unhandledErrors: unknown,
    reason: string,
  ): void {
    const facts = factsOf(testModules, reason, [...this.seenFailing], this.root());
    const problems = unprovenResults(facts);
    const held = this.held;
    this.held = [];
    this.ended = true;
    const files = facts.modules.length;
    const tests = facts.modules.reduce((sum, module) => sum + module.tests.length, 0);
    const timeouts = `${held.length} progress report${held.length === 1 ? '' : 's'} from a test worker timed out`;
    // vitest has already chosen its exit code, so a run this check refuses fails here. A run
    // vitest itself failed, with nothing held back, is left to vitest's own report.
    const refuse = problems.length > 0 && (held.length > 0 || reason === 'passed');
    if (!refuse) {
      if (held.length > 0) {
        console.warn(
          `vitest.reporter.ts: ${timeouts}, but all ${tests} tests in ${files} files reported a pass or a skip, so the run stands.`,
        );
      }
      return;
    }
    process.exitCode = 1;
    const lines = [
      held.length > 0
        ? `vitest.reporter.ts: this run FAILS. ${timeouts}, and these results were not seen to pass:`
        : 'vitest.reporter.ts: this run FAILS. vitest counted it as passed, but these results were not seen to pass:',
      ...problems.map((problem) => `  - ${problem}`),
      ...held.map(({ error }) => `  held back: ${messageOf(error)}`),
    ];
    console.error(lines.join('\n'));
  }

  private failLate(problem: string): void {
    process.exitCode = 1;
    console.error(`vitest.reporter.ts: this run FAILS. ${problem}.`);
  }

  private root(): string {
    return this.vitest?.config.root ?? process.cwd();
  }
}

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}
