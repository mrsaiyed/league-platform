// The Sentry adapter. UNVERIFIED: never run against Sentry; there is no account or
// network here (T-201). It is written against the small part of Sentry's client it
// needs, so this file imports no vendor library: the app that wires it in passes the
// real client (a thin wrapper over Sentry.captureException) at startup, and this is
// the only place that knows Sentry's shape. Reports arrive here already scrubbed.
//
// WHEN THE REAL CLIENT IS WIRED: this adapter only protects what it sends itself.
// The SDK also collects on its own (breadcrumbs, request URLs, headers, cookies,
// user data, console output). Configure it with sendDefaultPii off, a `beforeSend`
// that runs redact() over the event, and `beforeBreadcrumb` that drops or scrubs
// breadcrumbs and request data, or T-86 is broken by the SDK, not by us.
import { createErrorReporter, type ErrorReporter } from './error-reporter.ts';

/** The minimal client this adapter calls. */
export type SentryLikeClient = {
  readonly captureException: (
    error: Error,
    hint: {
      readonly tags: Record<string, string>;
      readonly extra: Record<string, unknown>;
      /** Same fingerprint, same issue: grouped and deduplicated (T8 §7). */
      readonly fingerprint: string[];
    },
  ) => void;
};

/** The first stack frame without line and column numbers, so a redeploy keeps the same group. */
function firstFrame(stack: string): string | null {
  const frame = stack.split('\n').find((line) => /^\s*at\s/.test(line));
  return frame === undefined ? null : frame.trim().replace(/:\d+(?::\d+)?\)?$/, '');
}

export function sentryErrorReporter(client: SentryLikeClient): ErrorReporter {
  return createErrorReporter((report) => {
    const error = new Error(report.message);
    error.name = report.name;
    error.stack = report.stack;
    const tags: Record<string, string> = {};
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(report.context)) {
      if (key === 'tags' && typeof value === 'object' && value !== null) {
        for (const [tag, text] of Object.entries(value)) tags[tag] = String(text);
      } else extra[key] = value;
    }
    // Ids are searchable as tags as well as kept in the extra data.
    for (const key of ['requestId', 'leagueId']) {
      const value = report.context[key];
      if (typeof value === 'string') tags[key] = value;
    }
    const frame = firstFrame(report.stack);
    client.captureException(error, {
      tags,
      extra,
      fingerprint: frame === null ? [report.name] : [report.name, frame],
    });
  });
}
