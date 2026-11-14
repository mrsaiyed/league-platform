// What happens once, when the web server starts, before it serves anyone (T-30,
// T-60). instrumentation.ts calls it through container.ts; so does the first
// request if the server skipped that. Any problem stops the start.
//
// 1. Every setting is read and checked (config.ts); a missing one stops it.
// 2. Local work and tests (APP_ENV local or test) never open a database address
//    (T-201). They run on the made-up stand-in, or with LOCAL_DATA=made-up-database
//    on the made-up database in memory, every migration and the seed leagues
//    (record 055): its login role is checked as a hosted one is, people sign in on
//    the sign-in stand-in, and the areas not yet moved onto the database refuse
//    (database-ports.ts).
// 3. Staging and production open PLATFORM_DATABASE_URL (never the tracker's
//    DATABASE_URL, R8) and check the login role it uses
//    (checkLoginRole, T-60): a superuser, a role that bypasses row-level security,
//    or the tables' owner stops the start. They then stop anyway, with a plain
//    reason, until sign-in on the real service is wired (steps 1.14 and 1.15).
import type { CommandLogLine } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import type { Config } from './config-schema.ts';
import { databasePorts, type DatabaseQueries } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import { standInPorts, standInSignIn, type StandInOptions } from './stand-in-ports.ts';

export class StartupError extends Error {
  constructor(message: string) {
    super(`The web app cannot start: ${message}`);
    this.name = 'StartupError';
  }
}

/**
 * What startup uses of packages/database: opening it (or the made-up one), checking
 * its login role, and what the database ports read.
 */
export type DatabasePackage = Pick<
  typeof DatabaseModule,
  'createDatabase' | 'checkLoginRole' | 'madeUpDatabase'
> &
  DatabaseQueries;

export type StartupDeps = {
  /** Loads packages/database; only staging and production ask for it. */
  readonly database: () => Promise<DatabasePackage>;
  /** Where the access module's T-196 lines go. */
  readonly log: (line: CommandLogLine) => void;
  /**
   * Where problems that are not one request's are reported: a sign-in email that could
   * not be sent (its kind only), a sign-in to put right by hand (the sign-in user's id
   * only). Never an address, a token or a secret (T-86).
   */
  readonly warn?: (message: string, fields: Readonly<Record<string, string>>) => void;
};

export async function startWebApp(config: Config, deps: StartupDeps): Promise<WebPorts> {
  if (config.APP_ENV === 'local' || config.APP_ENV === 'test') {
    const options: StandInOptions = {
      appEnv: config.APP_ENV,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      log: deps.log,
      ...(deps.warn === undefined ? {} : { warn: deps.warn }),
      emailFrom: config.EMAIL_FROM,
    };
    if (config.LOCAL_DATA === 'made-up-database') return onMadeUpDatabase(options, deps);
    const ports = standInPorts(options);
    await ports.signUpMadeUpMember();
    return ports;
  }
  // loadConfig requires it here; checked again so the type says so.
  const url = config.PLATFORM_DATABASE_URL;
  if (url === undefined) {
    throw new StartupError(`PLATFORM_DATABASE_URL is needed when APP_ENV is ${config.APP_ENV}.`);
  }
  const database = await deps.database();
  const db = database.createDatabase({ kind: 'postgres', url });
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

/** Local work and tests on the made-up database in memory (record 055). */
async function onMadeUpDatabase(options: StandInOptions, deps: StartupDeps): Promise<WebPorts> {
  // The sign-in stand-in first: it refuses a site address that is not local or a test name.
  const signIn = standInSignIn(options);
  const database = await deps.database();
  const made = await database.madeUpDatabase();
  const db = database.createDatabase(made.source);
  try {
    const problems = await database.checkLoginRole(db);
    if (problems.length > 0) {
      throw new StartupError(
        `the database login role is not fit for the app (T-60): ${problems.join('; ')}.`,
      );
    }
    await signIn.signUpMadeUpMember();
  } catch (error) {
    await db.close();
    await made.close();
    throw error;
  }
  // Open for as long as the process runs; it holds nothing that must be kept.
  return databasePorts({
    database,
    db,
    signIn: signIn.signIn,
    signInMail: signIn.signInMail,
    log: options.log,
    warn: (message, fields) => deps.warn?.(message, fields),
  });
}
