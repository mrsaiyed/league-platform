// A reporter that adds no output of its own. It keeps one kind of vitest error from failing
// a run: "Timeout calling onTaskUpdate", the 60-second limit vitest puts on a test worker's
// progress report to the main process. When a computer is crowded (several runs of the gate
// at once, see docs/build/RUNBOOK.md), a report can go unanswered for a minute although every
// test went on to pass, and vitest then exits 1. The report only feeds the progress display.
// Such a timeout is held back while the run goes on, and put back at the end of the run
// unless every test file finished as passed or skipped, so a run that lost or failed
// anything still fails. Every other unhandled error still fails the run at once. Each held
// timeout is printed, so it is never silent.
import type { Vitest } from 'vitest/node';

const progressReportTimeout = /\[vitest-worker\]: Timeout calling "onTaskUpdate"/;

type ErrorState = { catchError: (error: unknown, type: string) => void };
type Held = { error: unknown; type: string };

export function isProgressReportTimeout(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && progressReportTimeout.test(message);
}

/** True only when the run reached its end with files, all passed or skipped. */
export function everyFileFinishedWell(states: ReadonlyArray<string>, reason: string): boolean {
  return (
    reason === 'passed' &&
    states.length > 0 &&
    states.every((state) => state === 'passed' || state === 'skipped')
  );
}

export default class IgnoreProgressReportTimeouts {
  private held: Held[] = [];
  private record: ErrorState['catchError'] | undefined;

  onInit(vitest: Vitest): void {
    const state = vitest.state as unknown as Partial<ErrorState>;
    if (typeof state.catchError !== 'function') {
      throw new Error(
        'vitest.reporter.ts: this vitest has no state.catchError; update the reporter before upgrading vitest.',
      );
    }
    const record = state.catchError.bind(state);
    this.record = record;
    state.catchError = (error, type) => {
      if (isProgressReportTimeout(error)) {
        console.warn(
          "Note: a test worker's progress report to vitest timed out on a busy computer; it is ignored only if every test file passes.",
        );
        this.held.push({ error, type });
        return;
      }
      record(error, type);
    };
  }

  onTestRunEnd(
    testModules: ReadonlyArray<{ state: () => string }>,
    _unhandledErrors: unknown,
    reason: string,
  ): void {
    const fine = everyFileFinishedWell(
      testModules.map((module) => module.state()),
      reason,
    );
    if (!fine) for (const { error, type } of this.held) this.record?.(error, type);
    this.held = [];
  }
}
