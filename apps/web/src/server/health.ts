// The web app's health check (T8 §7: an outside uptime check calls it every minute).
// It answers one question: did the app start? Startup checks every setting and, in
// staging and production, the database login role (startup.ts), so a server that
// answers at all has passed them; this asks the same ports again, which fails if
// starting failed. The answer holds no setting, address, error message or person
// (T-86), only fixed words.
export type WebHealth = {
  readonly status: 'ok' | 'down';
  readonly app: 'web';
  readonly checks: { readonly startup: 'ok' | 'failed' };
  /** When the check ran, as an ISO time. */
  readonly time: string;
};

export type WebHealthDeps = {
  /** Resolves when the app has started (webPorts in container.ts); rejects if it could not. */
  readonly started: () => Promise<unknown>;
  /** Milliseconds since the epoch; injected so tests are exact. Default Date.now. */
  readonly now?: () => number;
};

// It does not ping the database on each call: that comes with step 2.93's part 2
// (record 055), until which staging and production do not serve at all.
export async function webHealth(
  deps: WebHealthDeps,
): Promise<{ httpStatus: 200 | 503; body: WebHealth }> {
  let startup: 'ok' | 'failed' = 'ok';
  try {
    await deps.started();
  } catch {
    startup = 'failed';
  }
  const ok = startup === 'ok';
  return {
    httpStatus: ok ? 200 : 503,
    body: {
      status: ok ? 'ok' : 'down',
      app: 'web',
      checks: { startup },
      time: new Date((deps.now ?? Date.now)()).toISOString(),
    },
  };
}
