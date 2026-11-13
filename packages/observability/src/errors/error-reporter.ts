// Error reporting (T8 §7, T-86). Code reports through this interface; which service
// receives the report is an adapter's business. Reports are redacted here, before
// any adapter sees them, so no adapter can forget to.
import { redact, redactText } from '../logging/redact.ts';

export type ErrorReportContext = {
  readonly requestId?: string;
  readonly leagueId?: string;
  readonly accountId?: string | null;
  /** Other ids and fixed words. Passed through redact; never put personal content here. */
  readonly tags?: Record<string, string>;
};

/** What an adapter receives: already scrubbed. */
export type ErrorReport = {
  readonly name: string;
  readonly message: string;
  /** Stack frames, scrubbed. Empty if there is none. */
  readonly stack: string;
  readonly context: Record<string, unknown>;
};

export type ErrorReporter = {
  /** Never throws and never waits for the network. */
  readonly capture: (error: unknown, context?: ErrorReportContext) => void;
};

/** What a concrete service does with a scrubbed report. */
export type ReportSink = (report: ErrorReport) => void;

/** A safe name, message and stack for anything that was thrown, error or not. */
function describeThrown(thrown: unknown): { name: string; message: string; stack: string } {
  try {
    if (thrown instanceof Error) {
      return {
        name: String(thrown.name),
        message: String(thrown.message),
        stack: typeof thrown.stack === 'string' ? thrown.stack : '',
      };
    }
    if (typeof thrown === 'string') return { name: 'Error', message: thrown, stack: '' };
    if (typeof thrown === 'object' && thrown !== null) {
      const maybe = (thrown as { message?: unknown }).message;
      return {
        name: 'NonErrorThrown',
        message: typeof maybe === 'string' ? maybe : 'a non-error object was thrown',
        stack: '',
      };
    }
    return { name: 'NonErrorThrown', message: `${typeof thrown} ${String(thrown)}`, stack: '' };
  } catch {
    return { name: 'NonErrorThrown', message: 'unreadable thrown value', stack: '' };
  }
}

/** Builds the reporter that scrubs, then hands the report to `sink`. */
export function createErrorReporter(sink: ReportSink): ErrorReporter {
  return {
    capture: (error, context) => {
      try {
        const thrown = describeThrown(error);
        const safeContext = redact(context ?? {});
        sink({
          name: redactText(thrown.name),
          message: redactText(thrown.message),
          stack: redactText(thrown.stack),
          context:
            typeof safeContext === 'object' && safeContext !== null && !Array.isArray(safeContext)
              ? (safeContext as Record<string, unknown>)
              : {},
        });
      } catch {
        // Reporting a fault must not cause one.
      }
    },
  };
}
