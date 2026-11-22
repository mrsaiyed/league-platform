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
//    database is on this computer (PLATFORM_DATABASE_SSL, record 082), and check the
//    login role it uses (checkLoginRole, T-60): a superuser, a role that bypasses
//    row-level security, or the tables' owner stops the start; so does a login that
//    cannot act as sign_in_store, the sign-in store's role (record 052). They then make
//    the real sign-in service, Supabase's adapter with the store in our own database,
//    and ask it first whether it confirms email addresses: the start stops unless it
//    plainly says it does (requireEmailConfirmation, step 2.115). Staging then serves on
//    the database (databasePorts), with every email captured, never sent (T-140).
//    Production stops there, with a plain reason (record 082): nothing is opened to
//    production in this stage.
import type { CommandLogLine } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import {
  botCheckFor,
  emailSenderFor,
  type BotCheck,
  type EmailConfirmation,
  type EmailConfirmationQuestion,
  type EmailConfirmationUnknown,
  type SignInCodeSender,
  type SignInService,
  type SupabaseSignInStore,
} from '@srleagues/providers';
import { leagueUrl } from '@srleagues/core';
import { simulatedLeagueExample, type Config } from './config-schema.ts';
import { databasePorts, type DatabaseQueries } from './database-ports.ts';
import { madeUpDatabaseTools, type SeedLeagueFacts } from './made-up-database-people.ts';
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
type ConnectCause = ReturnType<typeof DatabaseModule.connectCauseOf>;

/**
 * Why the database could not be used, in one plain sentence each and what to set (record
 * 082, the lead's correction of 2026-11-17 02:17): the certificate, the login, or the
 * database not reached. Told by the error's kind only; never its message, which may hold
 * the address and its password.
 */
const databaseRefusals: Readonly<Record<ConnectCause, string>> = {
  certificate:
    'the database’s certificate could not be checked: set PLATFORM_DATABASE_CA to the database’s own certificate (the PEM text from its settings page), then start the app again.',
  ssl: 'the database would not take an encrypted connection: check that PLATFORM_DATABASE_URL is the hosted database’s address (PLATFORM_DATABASE_SSL=off is allowed only for a database on this computer), then start the app again.',
  login:
    'the database refused the password or login: check the app’s own login and its password in PLATFORM_DATABASE_URL, then start the app again.',
  database:
    'the database named at the end of PLATFORM_DATABASE_URL does not exist there: check its name in the address, then start the app again.',
  host: 'the database could not be reached: its host in PLATFORM_DATABASE_URL was not found; check the address, then start the app again.',
  network:
    'the database could not be reached: check the address and port in PLATFORM_DATABASE_URL and that the database is running, then start the app again.',
  timeout:
    'the database could not be reached: it did not answer in time; check the address and port in PLATFORM_DATABASE_URL and that the database is running, then start the app again.',
  unknown:
    'the database could not be reached: check PLATFORM_DATABASE_URL and that the database is running, then start the app again.',
};

/** The sentence for a database that refused the start-up, by its kind. */
export const databaseRefusal = (cause: ConnectCause): string => databaseRefusals[cause];

export type DatabasePackage = Pick<
  typeof DatabaseModule,
  | 'createDatabase'
  | 'connectCauseOf'
  | 'checkLoginRole'
  | 'checkSignInStoreLogin'
  | 'createDatabaseSignInStore'
  | 'demoLeague'
  | 'madeUpDatabase'
  | 'seedLeagues'
  | 'simulatedOwner'
  | 'simulationDefaults'
  | 'simulationOptionsFrom'
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
   * Where a problem that wants someone told at once is reported, at error level: today the
   * bot check that could not be asked (botCheckAlarmLine). The same rule as warn: no address,
   * no token, no secret.
   */
  readonly alarm?: (message: string, fields: Readonly<Record<string, string>>) => void;
  /**
   * Local work and tests only: the working folder's `.local/captured-email`, where a copy
   * of each email to a made-up address is written once the app has started (step 2.96,
   * kept-emails.ts). Left out, nothing is written.
   */
  readonly keptEmailsFolder?: string | null;
  /**
   * Local work and tests only: a line for the person at the terminal that started the app
   * (the simulated league's, step 2.236). Left out, nothing is said.
   */
  readonly say?: (line: string) => void;
};

/** `LOCAL_SIMULATED_LEAGUE=on`: a small league, the size of a town's. */
const simulatedLeagueOn = { teams: 8, divisions: 1, rounds: 7, tracked: 2, seed: 1 } as const;

/** Above this many teams the start takes about a minute, and the line before it says so. */
const simulatedLeagueSlowAbove = 30;

export async function startWebApp(config: Config, deps: StartupDeps): Promise<WebPorts> {
  if (runsOnMadeUpData(config.APP_ENV)) {
    const options: StandInOptions = {
      appEnv: config.APP_ENV,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      log: deps.log,
      ...(deps.warn === undefined ? {} : { warn: deps.warn }),
      emailFrom: config.EMAIL_FROM,
      localDesign: config.LOCAL_DESIGN,
      localBotCheck: config.LOCAL_BOT_CHECK,
      ...(config.LOCAL_NOW === undefined ? {} : { worldStartsAt: config.LOCAL_NOW }),
      ...(config.LOCAL_BINNED_TEAM === undefined ? {} : { binnedTeam: config.LOCAL_BINNED_TEAM }),
      keptEmailsFolder: deps.keptEmailsFolder ?? null,
    };
    if (config.LOCAL_DATA === 'made-up-database') {
      return onMadeUpDatabase(options, deps, {
        demoLeague: config.LOCAL_DEMO_LEAGUE === 'on',
        simulatedLeague:
          config.LOCAL_SIMULATED_LEAGUE === 'off' ? undefined : config.LOCAL_SIMULATED_LEAGUE,
      });
    }
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
  // The bot check (record 081), made here once for staging and production and handed to
  // the database ports below: the one place it is wired online (step 2.93's last part).
  const botCheck = hostedBotCheck(config, deps);
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
    } catch (error) {
      // The driver's message may hold the address; only its kind is told (record 082).
      throw new StartupError(databaseRefusal(database.connectCauseOf(error)));
    }
    if (problems.length > 0) {
      throw new StartupError(
        `the database login role is not fit for the app (T-60): ${problems.join('; ')}.`,
      );
    }
    let storeProblems: string[];
    try {
      storeProblems = await database.checkSignInStoreLogin(db);
    } catch (error) {
      throw new StartupError(databaseRefusal(database.connectCauseOf(error)));
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
      botCheck,
      log: deps.log,
      warn: (message, fields) => deps.warn?.(message, fields),
      // A real database carries no local tools: both local pages answer "not found".
      localTools: null,
      // Only staging gets here (production stopped above), and says so (step 2.205).
      testCopy: config.APP_ENV === 'staging',
      reportDesign: (message, fields) => deps.warn?.(message, fields),
    });
  } catch (error) {
    await db.close();
    throw error;
  }
}

/**
 * Why production stops after every check has passed (record 082): this stage opens only
 * the test copy (T-270). Said in fixed words.
 */
const productionNotOpen =
  'every check passed, but "production" does not serve anyone yet: only the test copy ("staging") is opened in this stage (record 082), because fixture import does not run on the database yet and youth leagues’ pages are not yet marked "do not index" there (step 2.60).';

/** Whether an address's host is this computer's own name (localhost or a loopback address). */
function onThisComputer(address: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname);
  } catch {
    return false;
  }
}

/** Said once at start-up when staging runs without Turnstile's keys (T-270, record 081). */
export const botCheckOffLine =
  'The bot check is off: TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are not set, so sign-in and sign-up are not checked for bots (staging only: production refuses to start without them).';

/**
 * The one error-level line, of a fixed shape, when the bot check could not be asked or
 * refused our key (record 081, Q2): its fields are `kind` only (key-refused, no-answer,
 * unexpected-answer), never an address, an answer or a key, so an alarm can be set on it. With
 * no-answer, password sign-in has gone on on the attempt limits alone and asking for a code
 * was refused.
 */
export const botCheckAlarmLine = 'bot check not asked';

/**
 * Staging's and production's bot check (botCheckFor): Turnstile, or in staging with neither
 * key the check switched off, said in one plain line. A problem Turnstile reports is warned
 * of by its kind only. The settings check has already refused one key without the other.
 */
export function hostedBotCheck(
  config: Config,
  deps: Pick<StartupDeps, 'alarm' | 'warn'>,
  /** Tests only: a stand-in for the network. */
  fetch?: typeof globalThis.fetch,
): BotCheck {
  let check: BotCheck;
  try {
    check = botCheckFor({
      appEnv: config.APP_ENV,
      siteHostname: new URL(config.PUBLIC_BASE_URL).hostname,
      turnstileSiteKey: config.TURNSTILE_SITE_KEY,
      turnstileSecretKey: config.TURNSTILE_SECRET_KEY,
      onProblem: (kind) => deps.alarm?.(botCheckAlarmLine, { kind }),
      ...(fetch === undefined ? {} : { fetch }),
    });
  } catch (error) {
    // botCheckFor's words name settings only, never a value.
    throw new StartupError(
      error instanceof Error ? error.message : 'the bot check could not be set up.',
    );
  }
  if (check.widget.kind === 'off') deps.warn?.(botCheckOffLine, {});
  return check;
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

/**
 * Whom "be this made-up person" lists on the made-up database (step 2.96): the seed
 * leagues' owners and staff, and the demo-shaped league's owner and one scorekeeper (step
 * 2.59), who can score a game of its tracked school.
 */
export function madeUpPeopleLeagues(
  database: Pick<DatabasePackage, 'demoLeague' | 'seedLeagues'>,
): SeedLeagueFacts[] {
  const demo = database.demoLeague;
  const scorer = demo.members.find((member) => member.role === 'scorekeeper');
  return [
    ...database.seedLeagues,
    {
      slug: demo.slug,
      name: demo.name,
      owner: demo.owner,
      members: scorer === undefined ? [] : [scorer],
    },
  ];
}

/**
 * LOCAL_SIMULATED_LEAGUE's size (step 2.236), read by the simulate command's own reader:
 * `on` is a small league; otherwise the command's words over the command's own defaults.
 */
export function simulatedLeagueSize(
  database: Pick<DatabasePackage, 'simulationDefaults' | 'simulationOptionsFrom'>,
  value: string,
): ReturnType<DatabasePackage['simulationOptionsFrom']> {
  if (value === 'on') return database.simulationOptionsFrom([], simulatedLeagueOn);
  return database.simulationOptionsFrom(value.split(/\s+/), database.simulationDefaults);
}

type MadeUpChoices = {
  /** LOCAL_DEMO_LEAGUE=on: the seed's demo-shaped league too (step 2.59). */
  readonly demoLeague: boolean;
  /** LOCAL_SIMULATED_LEAGUE, when set: a simulated league of that size (step 2.236). */
  readonly simulatedLeague: string | undefined;
};

/** Local work and tests on the made-up database in memory (record 055). */
async function onMadeUpDatabase(
  options: StandInOptions,
  deps: StartupDeps,
  { demoLeague, simulatedLeague }: MadeUpChoices,
): Promise<WebPorts> {
  // The sign-in stand-in first: it refuses a site address that is not local or a test name.
  const signIn = standInSignIn(options);
  const database = await deps.database();
  const size =
    simulatedLeague === undefined ? undefined : simulatedLeagueSize(database, simulatedLeague);
  if (typeof size === 'string') {
    throw new StartupError(
      `LOCAL_SIMULATED_LEAGUE="${simulatedLeague}" cannot be read: ${size} For example ${simulatedLeagueExample}`,
    );
  }
  if (size !== undefined) {
    const slow = size.teams > simulatedLeagueSlowAbove ? 'about a minute' : 'some seconds';
    deps.say?.(
      `Playing a simulated league at start: ${size.teams} teams in ${size.divisions} division(s), ${size.rounds} rounds, ${size.tracked} tracked, seed ${size.seed}. This takes ${slow}.`,
    );
  }
  const started = performance.now();
  // Each seed league's season under way, with its venue and one game scored live, so the
  // public pages have something to show; with LOCAL_DEMO_LEAGUE=on only, the seed's
  // demo-shaped league with its whole season played (step 2.59), which takes some seconds;
  // with LOCAL_SIMULATED_LEAGUE only, a simulated season played through the same code as
  // `npm run simulate` (step 2.236), and checked by its seven checks.
  const made = await database.madeUpDatabase({
    underWay: true,
    tracked: true,
    demo: demoLeague,
    ...(size === undefined ? {} : { simulate: size }),
  });
  const simulated = made.simulated;
  const report = made.simulatedReport;
  if (simulated !== undefined && report !== undefined) {
    const failed = report.checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      await made.close();
      throw new StartupError(
        `the simulated league failed its own checks: ${failed.map((check) => `${check.name} (${check.detail})`).join('; ')}.`,
      );
    }
    const address = `${options.publicBaseUrl.replace(/\/$/, '')}${leagueUrl(simulated.plan, 'home')}`;
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    deps.say?.(
      `Simulated league ready: ${simulated.plan.name}, ${simulated.plan.games.length} games, all ${report.checks.length} checks hold, at ${address} (start took ${seconds} s). Sign in as its owner at ${options.publicBaseUrl.replace(/\/$/, '')}/signin/made-up-people.`,
    );
  }
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
    botCheck: signIn.botCheck,
    log: options.log,
    warn: (message, fields) => deps.warn?.(message, fields),
    // The kept emails, and the seed leagues' people to sign in as by a code (step 2.96).
    // With them the ports answer only requests made on this computer, as the stand-in's.
    localTools: {
      tools: madeUpDatabaseTools(
        [
          ...(demoLeague ? madeUpPeopleLeagues(database) : database.seedLeagues),
          // The simulated league's owner, who acts for it (simulate-league.ts, step 2.236).
          ...(simulated === undefined
            ? []
            : [
                {
                  slug: simulated.plan.slug,
                  name: simulated.plan.name,
                  owner: database.simulatedOwner,
                  members: [],
                },
              ]),
        ],
        standInMember,
        signIn,
      ),
      publicBaseUrl: options.publicBaseUrl,
    },
    reportDesign: (message, fields) => deps.warn?.(message, fields),
  });
}
