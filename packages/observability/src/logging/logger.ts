// Structured logs (T-196): one JSON object per line, with a level and the request
// ID carried through. Everything passes through redact first (T-86). A logger never
// throws: a broken sink loses the line and nothing else.
import { redact, redactText } from './redact.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Where finished lines go: a line of JSON, no newline. */
export type LogSink = (line: string) => void;

export type Logger = {
  readonly debug: (msg: string, fields?: Record<string, unknown>) => void;
  readonly info: (msg: string, fields?: Record<string, unknown>) => void;
  readonly warn: (msg: string, fields?: Record<string, unknown>) => void;
  readonly error: (msg: string, fields?: Record<string, unknown>) => void;
  /** A logger that adds these fields (usually `requestId`) to every line. */
  readonly child: (fields: Record<string, unknown>) => Logger;
};

export type LoggerOptions = {
  readonly sink: LogSink;
  /** Lines below this level are dropped. Default info. */
  readonly level?: LogLevel;
  /** Milliseconds since the epoch; injected so tests are exact. Default Date.now. */
  readonly now?: () => number;
  /** Fields on every line, such as the service name. */
  readonly base?: Record<string, unknown>;
};

/** Writes each line to the process output (stdout, which hosting collects). */
export const consoleSink: LogSink = (line) => {
  console.log(line);
};

/** Collects lines in memory, for tests and the local adapter. */
export function memorySink(): { sink: LogSink; lines: string[] } {
  const lines: string[] = [];
  return { sink: (line) => void lines.push(line), lines };
}

const reserved = ['time', 'level', 'msg'];

export function createLogger(options: LoggerOptions): Logger {
  // An unknown level word (from an environment setting) falls back to info.
  const threshold = order[options.level ?? 'info'] ?? order.info;
  const now = options.now ?? Date.now;
  const make = (bound: Record<string, unknown>): Logger => {
    const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
      if (order[level] < threshold) return;
      try {
        // Bound fields (requestId, leagueId) are redacted apart and written last, so a
        // call's fields can neither override them nor make them unreadable.
        const safeCall = redact(fields ?? {});
        const safeBound = redact(bound);
        const asObject = (value: unknown): Record<string, unknown> | null =>
          typeof value === 'object' && value !== null && !Array.isArray(value)
            ? { ...(value as Record<string, unknown>) }
            : null;
        const extra: Record<string, unknown> = {
          ...(asObject(safeCall) ?? { fields: '[unreadable]' }),
          ...(asObject(safeBound) ?? {}),
        };
        for (const key of reserved) delete extra[key];
        const line = JSON.stringify({
          time: new Date(now()).toISOString(),
          level,
          msg: redactText(String(msg)),
          ...extra,
        });
        options.sink(line);
      } catch {
        // A logger must never break what it is logging.
      }
    };
    return {
      debug: (msg, fields) => write('debug', msg, fields),
      info: (msg, fields) => write('info', msg, fields),
      warn: (msg, fields) => write('warn', msg, fields),
      error: (msg, fields) => write('error', msg, fields),
      child: (fields) => make({ ...bound, ...fields }),
    };
  };
  return make({ ...options.base });
}

/** The T-196 command line, as packages/core's `deps.log` hands it over (shape only, no import). */
export type CommandLine = {
  readonly command: string;
  readonly requestId: string;
  readonly leagueId: string;
  readonly accountId: string | null;
  readonly durationMs: number | null;
  readonly outcome: 'ok' | 'refused' | 'failed';
  readonly errorCode?: string;
};

/** A function for `CommandDeps.log`: one line per command, failures at error level. */
export function commandLogger(logger: Logger): (line: CommandLine) => void {
  return (line) => {
    const level: LogLevel = line.outcome === 'failed' ? 'error' : 'info';
    logger[level]('command', {
      command: line.command,
      requestId: line.requestId,
      leagueId: line.leagueId,
      accountId: line.accountId,
      durationMs: line.durationMs,
      outcome: line.outcome,
      ...(line.errorCode === undefined ? {} : { errorCode: line.errorCode }),
    });
  };
}
