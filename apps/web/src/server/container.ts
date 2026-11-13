// The one place adapters are plugged into the web app (T2 §4). Everything a page
// needs from outside comes from webPorts(), started once per server process.
//
// The answer is kept on globalThis, not in this module: Next.js may load this file
// more than once in one process (the proxy and the pages are bundled apart), and the
// app must still start only once.
//
// The database package is loaded by Node.js itself when the app starts on a
// database (staging and production), not bundled by Next.js: it runs TypeScript
// directly as the tracker does, and its migration runner finds its folder on disk.
import { consoleSink, createLogger } from '@srleagues/observability';
import { getConfig } from './config.ts';
import type { WebPorts } from './ports.ts';
import { startWebApp } from './startup.ts';

const key = '__srleaguesWebPorts';
type Holder = { [key]?: Promise<WebPorts> };

/** The web app's ports, starting the app on first use (startup.ts). */
export function webPorts(): Promise<WebPorts> {
  const holder = globalThis as Holder;
  holder[key] ??= start();
  return holder[key];
}

function start(): Promise<WebPorts> {
  const config = getConfig();
  const logger = createLogger({ sink: consoleSink, level: config.LOG_LEVEL, base: { app: 'web' } });
  return startWebApp(config, {
    database: () => import(/* turbopackIgnore: true */ '@srleagues/database'),
    log: (line) => logger.info('command', line),
  });
}
