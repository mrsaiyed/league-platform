// What happens once, when the web server starts, before it serves anyone (T-30,
// T-60). instrumentation.ts calls it through container.ts; so does the first
// request if the server skipped that. Any problem stops the start.
//
// 1. Every setting is read and checked (config.ts); a missing one stops it.
// 2. Local work and tests (APP_ENV local or test) never open a database address
//    (T-201). They run on the made-up stand-in, or with LOCAL_DATA=made-up-database
//    on the made-up database in memory, every migration and the seed leagues with
//    their seasons under way (record 055, step 2.93 part 2): its login role is checked
//    as a hosted one is, people sign in on the sign-in stand-in, and the one area not yet
//    moved onto the database (fixture import) refuses (database-ports.ts).
// 3. Staging and production open PLATFORM_DATABASE_URL (never the tracker's
//    DATABASE_URL, R8), over SSL with the server's certificate checked unless the
//    database is on this computer (PLATFORM_DATABASE_SSL, record 081), and check the
//    login role it uses (checkLoginRole, T-60): a superuser, a role that bypasses
//    row-level security, or the tables' owner stops the start; so does a login that
//    cannot act as sign_in_store, the sign-in store's role (record 052). They then make
//    the real sign-in service, Supabase's adapter with the store in our own database,
//    and ask it first whether it confirms email addresses: the start stops unless it
//    plainly says it does (requireEmailConfirmation, step 2.115). Staging then serves on
//    the database (databasePorts), with every email captured, never sent (T-140).
//    Production stops there, with a plain reason (record 081): nothing is opened to
//    production in this stage.
import type { CommandLogLine } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import {
  emailSenderFor,
  type EmailConfirmation,
  type EmailConfirmationQuestion,
  type EmailConfirmationUnknown,
  type SignInCodeSender,
  type SignInService,
  type SupabaseSignInStore,
} from '@srleagues/providers';
import type { Config } from './config-schema.ts';
import { databasePorts, type DatabaseQueries } from './database-ports.ts';
import { madeUpDatabaseTools } from './made-up-database-people.ts';
import { runsOnMadeUpData } from './made-up-mode.ts';
import type { WebPorts } from './ports.ts';
import { createSignInMail } from './sign-in/sign-in-mail.ts';
import {
  standInMember,
  standInPorts,
  standInSignIn,
  type StandInOptions,
} from './stand-in-ports.ts';

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
  | 'createDatabase'
  | 'checkLoginRole'
  | 'checkSignInStoreLogin'
  | 'createDatabaseSignInStore'
  | 'madeUpDatabase'
  | 'seedLeagues'
> &
  DatabaseQueries;

/** Where the real sign-in service is, from SUPABASE_URL and SUPABASE_SECRET_KEY (T-30). */
export type RealSignInSettings = { readonly projectUrl: string; readonly secretKey: string };

/** What the real sign-in service is made with in staging and production (record 018). */
export type RealSignInWiring = RealSignInSettings & {
  /** What Supabase does not keep, in our own database (createDatabaseSignInStore, record 052). */
  readonly store: SupabaseSignInStore;
  /** Where its codes go: our own email service (T4 §3), captured outside production. */
  readonly codeSender: SignInCodeSender;
  /** Our own origin, the one place Google may send the browser back to (PUBLIC_BASE_URL). */
  readonly returnOrigins: readonly string[];
  /** Plain http, only to a sign-in service on this computer (a local fake in a test). */
  readonly allowLocalHttp: boolean;
};

export type StartupDeps = {
  /** Loads packages/database; only staging and production ask for it. */
  readonly database: () => Promise<DatabasePackage>;
  /**
   * The real sign-in service (Supabase's adapter, container.ts); only staging and
   * production ask for it. Start-up asks it first whether it confirms email addresses
   * (step 2.115), and only then serves anyone through it.
   */
  readonly realSignIn: (wiring: RealSignInWiring) => SignInService;
  /** Where the access module's T-196 lines go. */
  readonly log: (line: CommandLogLine) => void;
  /**
   * Where problems that are not one request's are reported: a sign-in email that could
   * not be sent (its kind only), a sign-in to put right by hand (the sign-in user's id
   * only). Never an address, a token or a secret (T-86).
   */
  readonly warn?: (message: string, fields: Readonly<Record<string, string>>) => void;
  /**
   * Local work and tests only: the working folder's `.local/captured-email`, where a copy
   * of each email to a made-up address is written once the app has started (step 2.96,
   * kept-emails.ts). Left out, nothing is written.
   */
  readonly keptEmailsFolder?: string | null;
};

export async function startWebApp(config: Config, deps: StartupDeps): Promise<WebPorts> {
  if (runsOnMadeUpData(config.APP_ENV)) {
    const options: StandInOptions = {
      appEnv: config.APP_ENV,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      log: deps.log,
      ...(deps.warn === undefined ? {} : { warn: deps.warn }),
      emailFrom: config.EMAIL_FROM,
      localDesign: config.LOCAL_DESIGN,
      ...(config.LOCAL_NOW === undefined ? {} : { worldStartsAt: config.LOCAL_NOW }),
      keptEmailsFolder: deps.keptEmailsFolder ?? null,
    };
    if (config.LOCAL_DATA === 'made-up-database') return onMadeUpDatabase(options, deps);
    const ports = standInPorts(options);
    await ports.signUpMadeUpMember();
    await ports.signUpMadeUpStaff();
    // The made-up people's own sign-ups above are not kept; every email from here on is.
    ports.startKeeping();
    return ports;
  }
  // loadConfig requires these here; checked again so the type says so.
  const url = config.PLATFORM_DATABASE_URL;
  if (url === undefined) {
    throw new StartupError(`PLATFORM_DATABASE_URL is needed when APP_ENV is ${config.APP_ENV}.`);
  }
  const projectUrl = config.SUPABASE_URL;
  const secretKey = config.SUPABASE_SECRET_KEY;
  if (projectUrl === undefined || secretKey === undefined) {
    throw new StartupError(
      `SUPABASE_URL and SUPABASE_SECRET_KEY are needed when APP_ENV is ${config.APP_ENV}.`,
    );
  }
  const database = await deps.database();
  const db = database.createDatabase({
    kind: 'postgres',
    url,
    ssl: config.PLATFORM_DATABASE_SSL,
    ...(config.PLATFORM_DATABASE_CA === undefined ? {} : { ca: config.PLATFORM_DATABASE_CA }),
    // A connection that drops while idle is replaced by the pool; said by its kind only.
    onIdleError: () => deps.warn?.('database connection dropped while idle', { kind: 'database' }),
  });
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
    let storeProblems: string[];
    try {
      storeProblems = await database.checkSignInStoreLogin(db);
    } catch {
      throw new StartupError('the database could not be reached to check the sign-in store.');
    }
    if (storeProblems.length > 0) {
      throw new StartupError(
        `the database login cannot reach the sign-in store (record 052): ${storeProblems.join('; ')}. As the migration login, run "grant sign_in_store to <the app’s login>;" once, then start the app again.`,
      );
    }
    const now = () => new Date();
    // Outside production every email is captured, never sent (T-140): staging's sign-in
    // codes stay in this server's memory (record 075 says how they are to be read).
    const signInMail = createSignInMail({
      sender: emailSenderFor({ appEnv: config.APP_ENV, resendApiKey: config.RESEND_API_KEY })
        .sender,
      fromAddress: config.EMAIL_FROM,
      siteOrigin: config.PUBLIC_BASE_URL,
      onNoticeFailed: (kind) => deps.warn?.('sign-in email not sent', { kind }),
      now,
    });
    const signIn = realSignIn(deps, {
      projectUrl,
      secretKey,
      store: database.createDatabaseSignInStore({ db, now }),
      codeSender: signInMail.codeSender,
      returnOrigins: [config.PUBLIC_BASE_URL],
      allowLocalHttp: onThisComputer(projectUrl),
    });
    // Step 2.115, first of all that touches sign-in: `account_for_sign_in` links an account
    // made in advance to whoever presents its address, which is safe only if the service
    // confirms addresses. Asked of the very adapter the app then signs people in with.
    await requireEmailConfirmation(signIn);
    if (config.APP_ENV === 'production') throw new StartupError(productionNotOpen);
    // Open for as long as the process runs.
    return databasePorts({
      database,
      db,
      signIn,
      signInMail,
      log: deps.log,
      warn: (message, fields) => deps.warn?.(message, fields),
      // A real database carries no local tools: both local pages answer "not found".
      localTools: null,
      reportDesign: (message, fields) => deps.warn?.(message, fields),
    });
  } catch (error) {
    await db.close();
    throw error;
  }
}

/**
 * Why production stops after every check has passed (record 081): this stage opens only
 * the test copy (T-270). Said in fixed words.
 */
const productionNotOpen =
  'every check passed, but "production" does not serve anyone yet: only the test copy ("staging") is opened in this stage (record 081), because fixture import does not run on the database yet and youth leagues’ pages are not yet marked "do not index" there (step 2.60).';

/** Whether an address's host is this computer's own name (localhost or a loopback address). */
function onThisComputer(address: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname);
  } catch {
    return false;
  }
}

/** The real sign-in service; a fault in its settings is said in fixed words, never with a value. */
function realSignIn(deps: StartupDeps, wiring: RealSignInWiring): SignInService {
  try {
    return deps.realSignIn(wiring);
  } catch {
    throw new StartupError(
      'the sign-in service could not be set up from SUPABASE_URL and SUPABASE_SECRET_KEY: the address must be the project’s https address and the key its secret key.',
    );
  }
}

const turnItOn =
  'turn on "Confirm email" in the Supabase project’s dashboard (Authentication, then Sign In / Providers, then Email), then start the app again';

const refusedOff = `the sign-in service does not confirm email addresses, so anyone could take over an account made in advance by typing its address: ${turnItOn}.`;

/** Why the service could not say, in fixed words of ours: never the service's own. */
const unknownBecause: Readonly<Record<EmailConfirmationUnknown, string>> = {
  'no-answer-in-time': 'it did not answer in time',
  'no-connection': 'it could not be reached',
  'key-refused': 'it refused the key',
  'setting-missing': 'it answered without the setting',
  'unexpected-answer': 'it gave an unexpected answer',
};

/**
 * The refusal for an answer that is not `on` or `off`. Only a word looked up in the
 * fixed list above, and a status that is a whole number in the range of HTTP's, can
 * reach the sentence: whatever else an adapter put in its answer stays out.
 */
function refusedUnknown(answer: unknown): string {
  let reason = 'the question itself failed';
  if (typeof answer === 'object' && answer !== null) {
    const { unknown, status } = answer as { readonly unknown?: unknown; readonly status?: unknown };
    if (typeof unknown === 'string' && Object.hasOwn(unknownBecause, unknown)) {
      reason = unknownBecause[unknown as EmailConfirmationUnknown];
      if (
        typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 100 &&
        status <= 599
      ) {
        reason += `, status ${status}`;
      }
    }
  }
  return `the sign-in service could not say whether it confirms email addresses (${reason}), and the app never starts without that: check that SUPABASE_URL and SUPABASE_SECRET_KEY are the project’s and that it can be reached, and ${turnItOn}.`;
}

/**
 * Step 2.115: the start stops unless the sign-in service plainly says it confirms
 * email addresses before a sign-in counts. `off` and `unknown` stop it alike, each
 * with one sentence saying what to turn on and where; `unknown`'s says why, in a
 * fixed kind (a throw is one too). Nothing is logged, and the message names no key,
 * address or person.
 */
export async function requireEmailConfirmation(signIn: EmailConfirmationQuestion): Promise<void> {
  let answer: EmailConfirmation | undefined;
  try {
    answer = await signIn.emailConfirmation();
  } catch {
    answer = undefined;
  }
  if (answer === 'on') return;
  throw new StartupError(answer === 'off' ? refusedOff : refusedUnknown(answer));
}

/** Local work and tests on the made-up database in memory (record 055). */
async function onMadeUpDatabase(options: StandInOptions, deps: StartupDeps): Promise<WebPorts> {
  // The sign-in stand-in first: it refuses a site address that is not local or a test name.
  const signIn = standInSignIn(options);
  const database = await deps.database();
  // Each seed league's season under way, so the public pages have something to show.
  const made = await database.madeUpDatabase({ underWay: true });
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
  signIn.startKeeping();
  // Open for as long as the process runs; it holds nothing that must be kept.
  return databasePorts({
    database,
    db,
    signIn: signIn.signIn,
    signInMail: signIn.signInMail,
    log: options.log,
    warn: (message, fields) => deps.warn?.(message, fields),
    // The kept emails, and the seed leagues' people to sign in as by a code (step 2.96).
    // With them the ports answer only requests made on this computer, as the stand-in's.
    localTools: {
      tools: madeUpDatabaseTools(database.seedLeagues, standInMember, signIn),
      publicBaseUrl: options.publicBaseUrl,
    },
    reportDesign: (message, fields) => deps.warn?.(message, fields),
  });
}
