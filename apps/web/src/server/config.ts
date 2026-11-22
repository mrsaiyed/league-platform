// T-30: the only file in the web app that reads process.env: the settings, once,
// and whether this is Next.js's build (isBuildPhase). Everything else calls these;
// the structure check fails the build on a read of process.env anywhere else.
import { trackerProjectFor } from '@srleagues/providers';
import { loadConfig, type Config } from './config-schema.ts';

let cached: Config | undefined;

/**
 * Reads and checks the environment on first use, against the tracker's Supabase
 * project too, read from the repository's supabase/site.json found from this file's
 * own location, never the working folder (trackerProjectFor, record 055); later
 * calls return the same object.
 */
export function getConfig(): Config {
  cached ??= loadConfig(process.env, { trackerProject: trackerProjectFor(import.meta.url) });
  return cached;
}

/**
 * Whether this process is `next build`, not a server. The build loads the app to
 * collect its pages, and must not start it: settings are a running server's, and
 * the build is run without them (record 020).
 */
export function isBuildPhase(): boolean {
  return process.env['NEXT_PHASE'] === 'phase-production-build';
}

/**
 * Whether this is `next dev` on this computer, whose pages need `eval` for React's error
 * stacks (security-headers.ts). Never a built server: `next start` sets production.
 */
export function isDevelopmentServer(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

/** Call once when the server starts, so a bad setting stops it before it serves anyone. */
export function assertConfig(): Config {
  return getConfig();
}
