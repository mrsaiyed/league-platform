// The local adapter: reports stay in memory (tests, development) or go to a logger.
import type { Logger } from '../logging/logger.ts';
import { createErrorReporter, type ErrorReport, type ErrorReporter } from './error-reporter.ts';

export function memoryErrorReporter(): { reporter: ErrorReporter; reports: ErrorReport[] } {
  const reports: ErrorReport[] = [];
  return { reporter: createErrorReporter((report) => void reports.push(report)), reports };
}

/** Writes each report as one error-level log line. */
export function loggerErrorReporter(logger: Logger): ErrorReporter {
  return createErrorReporter((report) => {
    logger.error('error report', {
      errorName: report.name,
      errorMessage: report.message,
      stack: report.stack,
      ...report.context,
    });
  });
}
