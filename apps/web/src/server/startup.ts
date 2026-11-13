// What happens once, when the web server starts, before it serves anyone (T-30,
// T-60). instrumentation.ts calls it through container.ts; so does the first
// request if the server skipped that. Any problem stops the start.
//
// 1. Every setting is read and checked (config.ts); a missing one stops it.
// 2. Local work and tests (APP_ENV local or test) run on the made-up stand-in and
//    never open a database (T-201).
// 3. Staging and production open DATABASE_URL and check the login role it uses
//    (checkLoginRole, T-60): a superuser, a role that bypasses row-level security,
//    or the tables' owner stops the start. They then stop anyway, with a plain
//    reason, until sign-in on the real service is wired (steps 1.14 and 1.15).
import type { CommandLogLine } from '@srleagues/core';
import type { DatabaseHandle } from '@srleagues/database';
import type { Config } from './config-schema.ts';
import type { WebPorts } from './ports.ts';
import { standInPorts } from './stand-in-ports.ts';

export class StartupError extends Error {
  constructor(message: string) {
    super(`The web app cannot start: ${message}`);
    this.name = 'StartupError';
  }
}

/** What startup uses of packages/database: opening it and checking its login role. */
export type DatabasePackage = {
  readonly createDatabase: (source: { kind: 'postgres'; url: string }) => DatabaseHandle;
  /** What is wrong with the login role, in plain words; empty when fit. */
  readonly checkLoginRole: (db: DatabaseHandle) => Promise<string[]>;
};

export type StartupDeps = {
  /** Loads packages/database; only staging and production ask for it. */
  readonly database: () => Promise<DatabasePackage>;
  /** Where the access module's T-196 lines go. */
  readonly log: (line: CommandLogLine) => void;
  /** NODE_ENV as config.ts read it (the sign-in stand-in refuses "production"). */
  readonly nodeEnv: string | undefined;
};

export async function startWebApp(config: Config, deps: StartupDeps): Promise<WebPorts> {
  if (config.APP_ENV === 'local' || config.APP_ENV === 'test') {
    return standInPorts({
      appEnv: config.APP_ENV,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      log: deps.log,
      nodeEnv: deps.nodeEnv,
      emailFrom: config.EMAIL_FROM,
    });
  }
  const database = await deps.database();
  const db = database.createDatabase({ kind: 'postgres', url: config.DATABASE_URL });
  try {
    let problems: string[];
    try {
      problems = await database.checkLoginRole(db);
    } catch {
      // The driver's message may hold the address; it is not repeated here.
      throw new StartupError('the database could not be reached to check its login role.');
    }
    if (problems.length > 0) {
      throw new StartupError(
        `the database login role is not fit for the app (T-60): ${problems.join('; ')}.`,
      );
    }
    throw new StartupError(
      `sign-in on the real service is not wired yet (steps 1.14 and 1.15), so "${config.APP_ENV}" cannot serve anyone.`,
    );
  } finally {
    await db.close();
  }
}
