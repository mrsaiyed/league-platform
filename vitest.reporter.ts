// A reporter that adds no output of its own. It keeps one kind of vitest error from failing
// a run: "Timeout calling onTaskUpdate", the 60-second limit vitest puts on a test worker's
// progress report to the main process. When a computer is crowded (several runs of the gate
// at once, see docs/build/RUNBOOK.md), a report can go unanswered for a minute although every
// test went on to pass, and vitest then exits 1. The report only feeds the progress display:
// each test's own result still reaches the summary, so a test that fails or is lost is still
// counted and still fails the run. Every other unhandled error still fails it. Each dropped
// timeout is printed, so it is never silent.
import type { Vitest } from 'vitest/node';

const progressReportTimeout = /\[vitest-worker\]: Timeout calling "onTaskUpdate"/;

type ErrorState = { catchError: (error: unknown, type: string) => void };

export default class IgnoreProgressReportTimeouts {
  onInit(vitest: Vitest): void {
    const state = vitest.state as unknown as ErrorState;
    const record = state.catchError.bind(state);
    state.catchError = (error, type) => {
      const message = (error as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && progressReportTimeout.test(message)) {
        console.warn(
          "Note: a test worker's progress report to vitest timed out on a busy computer; the tests themselves are counted as usual.",
        );
        return;
      }
      record(error, type);
    };
  }
}
