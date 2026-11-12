// T-30: the only file in the web app that reads process.env, and it does so once.
// Everything else calls getConfig(); the structure check fails the build on a read
// of process.env anywhere else.
import { loadConfig, type Config } from './config-schema.ts';

let cached: Config | undefined;

/** Reads and checks the environment on first use; later calls return the same object. */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}

/** Call once when the server starts, so a bad setting stops it before it serves anyone. */
export function assertConfig(): Config {
  return getConfig();
}
