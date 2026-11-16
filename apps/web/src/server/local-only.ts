// The gate of the local-only pages and their form (step 2.96, local-tools.ts): the app's
// own settings (APP_ENV) and its ports, read on the server. Every page and action of the
// local tools asks this first and answers notFound() when it gives undefined.
import { getConfig } from './config.ts';
import { webPorts } from './container.ts';
import { localToolsOf, type LocalTools } from './local-tools.ts';

/** The local tools of this server, or undefined outside local work and tests. */
export function localTools(): Promise<LocalTools | undefined> {
  return localToolsOf(getConfig().APP_ENV, webPorts);
}
