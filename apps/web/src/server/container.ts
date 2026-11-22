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
import { consoleSink, createLogger, type Logger } from '@srleagues/observability';
import { createSupabaseSignIn } from '@srleagues/providers';
import { getConfig } from './config.ts';
import { keptEmailsFolderFrom } from './kept-emails.ts';
import { runsOnMadeUpData } from './made-up-mode.ts';
import type { WebPorts } from './ports.ts';
import { startWebApp, type StartupDeps } from './startup.ts';

/**
 * Where the app's own lines go: commands at info, warnings at warn, and the one alarm (the
 * bot check our server could not ask, startup.ts) at error level, so an alarm can be set on it.
 */
export function logLinesFor(logger: Logger): Required<Pick<StartupDeps, 'log' | 'warn' | 'alarm'>> {
  return {
    log: (line) => logger.info('command', line),
    warn: (message, fields) => logger.warn(message, fields),
    alarm: (message, fields) => logger.error(message, fields),
  };
}

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
    // Staging and production only: the real sign-in service, Supabase's adapter over its
    // HTTP API with the store in our own database (records 018 and 052), asked at start
    // whether it confirms email addresses before anyone is signed in through it (step 2.115).
    realSignIn: (wiring) =>
      createSupabaseSignIn({ ...wiring, fetch: (url, init) => fetch(url, init) }),
    // Commands at info, warnings at warn, the bot check's alarm at error (logLinesFor).
    ...logLinesFor(logger),
    // Read only on made-up data (local work and tests): where the kept emails are written,
    // the working folder found from where the server runs (kept-emails.ts, step 2.96).
    keptEmailsFolder: runsOnMadeUpData(config.APP_ENV) ? keptEmailsFolderFrom(process.cwd()) : null,
    // A line for the person at the terminal (the simulated league's, local and tests only).
    say: (line) => console.log(line),
  });
}
