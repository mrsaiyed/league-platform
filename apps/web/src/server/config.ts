// T-30: the only file in the web app that reads process.env: the settings, once,
// and whether this is Next.js's build (isBuildPhase). Everything else calls these;
// the structure check fails the build on a read of process.env anywhere else.
import { loadConfig, type Config } from './config-schema.ts';

let cached: Config | undefined;

/** Reads and checks the environment on first use; later calls return the same object. */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
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

/** Call once when the server starts, so a bad setting stops it before it serves anyone. */
export function assertConfig(): Config {
  return getConfig();
}
