// The web app's health check (T8 §7: an outside uptime check calls it every minute).
// It answers two questions: did the app start, and does its database answer now? Startup
// checks every setting and, in staging and production, the database login role, the
// sign-in store and the sign-in service (startup.ts), so a server that answers at all has
// passed them; this asks the same ports again, which fails if starting failed, and then
// asks the database (packages/database's databaseAnswers), with a time limit, so a
// database that has gone away or hangs shows as "down" within seconds. The made-up
// stand-in has no database: its answer says so. The answer holds no setting, address,
// error message or person (T-86), only fixed words.
export type WebHealth = {
  readonly status: 'ok' | 'down';
  readonly app: 'web';
  readonly checks: {
    readonly startup: 'ok' | 'failed';
    /** 'none' on the made-up stand-in, which has no database; 'failed' also when not started. */
    readonly database: 'ok' | 'failed' | 'none';
  };
  /** When the check ran, as an ISO time. */
  readonly time: string;
};

/** How long the database may take to answer before the check calls it down. */
export const databaseAnswerMs = 3_000;

export type WebHealthDeps = {
  /**
   * Resolves when the app has started (webPorts in container.ts), with how to ask its
   * database (`databaseCheck`, null where there is none); rejects if it could not start.
   */
  readonly started: () => Promise<{ readonly databaseCheck: (() => Promise<boolean>) | null }>;
  /** Milliseconds since the epoch; injected so tests are exact. Default Date.now. */
  readonly now?: () => number;
  /** Waits `ms` and resolves; injected so tests need not wait. Default a timer. */
  readonly wait?: (ms: number) => Promise<void>;
};

const realWait = (ms: number) =>
  new Promise<void>((resolve) => {
    // Never keeps the process alive on its own.
    setTimeout(resolve, ms).unref?.();
  });

export async function webHealth(
  deps: WebHealthDeps,
): Promise<{ httpStatus: 200 | 503; body: WebHealth }> {
  let startup: 'ok' | 'failed' = 'ok';
  let database: 'ok' | 'failed' | 'none' = 'failed';
  try {
    const { databaseCheck } = await deps.started();
    if (databaseCheck === null) {
      database = 'none';
    } else {
      const timedOut = (deps.wait ?? realWait)(databaseAnswerMs).then(() => false);
      const answered = await Promise.race([databaseCheck().catch(() => false), timedOut]);
      database = answered ? 'ok' : 'failed';
    }
  } catch {
    startup = 'failed';
  }
  const ok = startup === 'ok' && database !== 'failed';
  return {
    httpStatus: ok ? 200 : 503,
    body: {
      status: ok ? 'ok' : 'down',
      app: 'web',
      checks: { startup, database },
      time: new Date((deps.now ?? Date.now)()).toISOString(),
    },
  };
}
