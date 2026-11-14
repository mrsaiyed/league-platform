// T-30: the only file in the web app that reads process.env: the settings, once,
// and whether this is Next.js's build (isBuildPhase). Everything else calls these;
// the structure check fails the build on a read of process.env anywhere else.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, trackerProjectOf, type Config } from './config-schema.ts';

let cached: Config | undefined;

/**
 * Reads and checks the environment on first use, against the tracker's Supabase
 * project too; later calls return the same object.
 */
export function getConfig(): Config {
  cached ??= loadConfig(process.env, { trackerProject: trackerProject() });
  return cached;
}

/**
 * The tracker's project reference from supabase/site.json, found from where the app
 * runs (the repository, or apps/web inside it); null if the file is not found or
 * names no Supabase project. Reads a file only; opens no address.
 */
function trackerProject(): string | null {
  let dir = process.cwd();
  for (let up = 0; up < 4; up += 1) {
    const file = path.join(dir, 'supabase', 'site.json');
    if (existsSync(file)) return trackerProjectOf(readFileSync(file, 'utf8'));
    dir = path.dirname(dir);
  }
  return null;
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
