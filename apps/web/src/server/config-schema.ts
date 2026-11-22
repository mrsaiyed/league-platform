// T-30: every setting and secret the web app needs, and the one function that checks
// them. It takes the environment as an argument and never reads process.env itself,
// so tests can hand it any set of values. config.ts reads the real environment once.
import {
  addressOnThisComputer,
  databaseCertificateFrom,
  platformDatabaseProblem,
  platformServiceProblem,
  trackerProjectProblem,
  type CertificateFileReader,
  type TrackerGuardFacts,
} from '@srleagues/providers';
import { z } from 'zod';
import { picturedDesignKeys } from './stand-in-designs.ts';

export type ConfigField = {
  /** Secret values never appear in any message, log or screen. */
  secret: boolean;
};

const text = z.string().trim().min(1);
const secretText = (minLength: number) =>
  z.string().trim().min(minLength, `must be at least ${minLength} characters`);

/**
 * LOCAL_SIMULATED_LEAGUE's shape: `on`, `off` (none, as left out), or `--name <number>`
 * pairs as the command takes them.
 */
const simulatedLeagueWords =
  /^(on|off|(--(teams|divisions|rounds|tracked|seed)\s+\d+)(\s+--(teams|divisions|rounds|tracked|seed)\s+\d+)*)$/;
/** The right example every refusal of LOCAL_SIMULATED_LEAGUE shows. */
export const simulatedLeagueExample =
  'LOCAL_SIMULATED_LEAGUE="--teams 24 --divisions 4 --rounds 10 --tracked 6 --seed 7"';

/** Every variable, with whether it is secret. `.env.example` lists the same names. */
export const fields = {
  APP_ENV: { secret: false },
  PUBLIC_BASE_URL: { secret: false },
  LOG_LEVEL: { secret: false },
  TRUSTED_PROXY: { secret: false },
  PLATFORM_DATABASE_URL: { secret: true },
  PLATFORM_DATABASE_SSL: { secret: false },
  PLATFORM_DATABASE_CA: { secret: false },
  LOCAL_BINNED_TEAM: { secret: false },
  LOCAL_BOT_CHECK: { secret: false },
  LOCAL_DATA: { secret: false },
  LOCAL_DEMO_LEAGUE: { secret: false },
  LOCAL_SIMULATED_LEAGUE: { secret: false },
  LOCAL_DESIGN: { secret: false },
  LOCAL_NOW: { secret: false },
  SESSION_SECRET: { secret: true },
  SUPABASE_URL: { secret: false },
  SUPABASE_SECRET_KEY: { secret: true },
  TURNSTILE_SITE_KEY: { secret: false },
  TURNSTILE_SECRET_KEY: { secret: true },
  RESEND_API_KEY: { secret: true },
  EMAIL_FROM: { secret: false },
  CONTACT_EMAIL: { secret: false },
  STRIPE_SECRET_KEY: { secret: true },
  STRIPE_WEBHOOK_SECRET: { secret: true },
} as const satisfies Record<string, ConfigField>;

export type ConfigName = keyof typeof fields;

const webUrl = z.url().regex(/^https?:\/\//i, 'must be an http or https address');

const appEnvs = ['local', 'test', 'staging', 'production'] as const;

const schema = z.object({
  APP_ENV: z.enum(appEnvs),
  PUBLIC_BASE_URL: webUrl,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Whose word is taken for a visitor's address in the sign-in attempt limits (records
  // 031 and 081, device.ts): 'none' nobody's; 'one' when exactly one proxy of the host
  // appends the address it was reached from; 'cloudflare' when Cloudflare stands in
  // front of that proxy, its CF-Connecting-IP believed only on a request that reached
  // the host from one of Cloudflare's addresses. The default 'none' is for local and
  // test only: in staging and production it must be set (mustBeExplicit), because with
  // 'none' every visitor shares one address and one person's wrong guesses lock out
  // everyone.
  TRUSTED_PROXY: z.enum(['none', 'one', 'cloudflare']).default('none'),
  // The platform's own database (R8): not DATABASE_URL, which the Al-Hadi tracker
  // reads, so a settings file made for the tracker can never point the web app at the
  // tracker's database. Local work and tests never open an address (T-201), so it is
  // needed only in staging and production.
  PLATFORM_DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(?:ql)?:\/\//, 'must be a postgres:// address')
    .optional(),
  // How the connection to PLATFORM_DATABASE_URL is encrypted (record 082): 'verify', the
  // default, is SSL with the server's certificate checked, against PLATFORM_DATABASE_CA when
  // it is given, else the system's certificate authorities; 'off' is no SSL, allowed only
  // for a database on this computer (its address names localhost), where no network lies
  // between. There is no way to use SSL without checking the certificate. The address
  // itself cannot change this: its ssl settings are taken out (create-database.ts).
  PLATFORM_DATABASE_SSL: z.enum(['verify', 'off']).default('verify'),
  // The database server's certificate authority (Supabase's is not one the system knows:
  // it is downloaded from the project's database settings, as for MIGRATION_DATABASE_CA):
  // its PEM text, or the path of a file holding it (step 2.203, T-299), read once here and
  // checked by databaseCertificateFrom before this schema sees it; by then it is the PEM
  // text. Public, not a secret; a value that is not a certificate is refused by name.
  PLATFORM_DATABASE_CA: z.string().optional(),
  // A team's short name in the first made-up league's current season, put in the bin as
  // the stand-in's world is made, with its games and results, as a team could be before
  // A-17 held such a team (step 2.180): so a browser test and the pictures can see how
  // every screen shows it. Only the stand-in's world reads it; only local and test.
  LOCAL_BINNED_TEAM: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a short name')
    .optional(),
  // What local work and tests run on (record 055): 'stand-in', the made-up leagues in
  // this process's memory (the default), or 'made-up-database', the made-up seed
  // leagues in a database in memory with every migration. Only local and test read it.
  // Which bot check local work and tests draw (record 081): the hidden-field stand-in, or a
  // made-up Turnstile drawn as the real box is, whose script a browser test serves itself.
  LOCAL_BOT_CHECK: z.enum(['stand-in', 'made-up-turnstile']).default('stand-in'),
  LOCAL_DATA: z.enum(['stand-in', 'made-up-database']).default('stand-in'),
  // 'on' loads the seed's demo-shaped league into the made-up database too (step 2.59): a
  // large league with a whole season, which takes some seconds at start. Off by default, so
  // a test that does not look at it starts as fast as before. Only with LOCAL_DATA=
  // made-up-database, and only local and test: a choice of the made-up data, no setting of
  // the product.
  LOCAL_DEMO_LEAGUE: z.enum(['on', 'off']).default('off'),
  // A simulated league played from empty to its final tables at start (step 2.236), its
  // size in the simulate command's own words ("--teams 24 --divisions 4 --rounds 10
  // --tracked 6 --seed 7"), or 'on' for a small one; the numbers themselves are checked at
  // start, by the command's own reader. Only with LOCAL_DATA=made-up-database, and only
  // local and test: a choice of the made-up data, no setting of the product.
  LOCAL_SIMULATED_LEAGUE: z
    .string()
    .trim()
    .regex(
      simulatedLeagueWords,
      `must be on, or the size in the simulate command's words, for example ${simulatedLeagueExample}`,
    )
    .optional(),
  // The design the first made-up league of the stand-in is drawn under, so that every
  // page can be pictured in every color set (scripts/shots.mjs --design, step 2.147): a
  // starting design, or a made-up one kept for pictures. Only local and test read it.
  LOCAL_DESIGN: z.enum(picturedDesignKeys).optional(),
  // The moment the made-up stand-in's world starts its clock at, a UTC time such as
  // 2026-11-15T20:01:00Z, so a browser test can be run as if at any hour (step 2.179): its
  // seed is made at that moment and its clock runs on from it. Only the stand-in's world
  // reads it, never the made-up database; only local and test.
  LOCAL_NOW: z.iso.datetime().optional(),
  // Nothing uses these yet (R8): each becomes required, where it is used, with the
  // step that first uses it. Given now, they are still checked.
  SESSION_SECRET: secretText(32).optional(),
  STRIPE_SECRET_KEY: secretText(8).optional(),
  STRIPE_WEBHOOK_SECRET: secretText(8).optional(),
  // The sign-in service (record 018): staging and production only; local work and
  // tests sign in on the stand-in.
  SUPABASE_URL: webUrl.optional(),
  SUPABASE_SECRET_KEY: secretText(16).optional(),
  // The bot check in front of sign-in and sign-up (T4 §6, record 081): Cloudflare
  // Turnstile's public site key and its secret key. Production needs both; staging takes
  // both or neither (neither switches the check off, T-270); local work and tests use the
  // stand-in whatever is given.
  TURNSTILE_SITE_KEY: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, 'must be a Turnstile site key')
    .optional(),
  TURNSTILE_SECRET_KEY: secretText(16).optional(),
  // Only production sends email (T-140); elsewhere every email is captured.
  RESEND_API_KEY: secretText(8).optional(),
  EMAIL_FROM: text.regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'must be an email address'),
  // Where the Terms and Privacy pages tell people to write to the people who run the site
  // (step 2.135): an address the founder gives, never one written in the code. Without
  // it the pages send a question through the league's admin instead.
  CONTACT_EMAIL: text.regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'must be an email address').optional(),
});

export type Config = Readonly<z.infer<typeof schema>>;

/** Optional variables: absent or blank means "use the default" or "none", not "missing". */
const optional: readonly ConfigName[] = [
  'LOG_LEVEL',
  'TRUSTED_PROXY',
  'PLATFORM_DATABASE_URL',
  'PLATFORM_DATABASE_SSL',
  'PLATFORM_DATABASE_CA',
  'LOCAL_BINNED_TEAM',
  'LOCAL_BOT_CHECK',
  'LOCAL_DATA',
  'LOCAL_DEMO_LEAGUE',
  'LOCAL_SIMULATED_LEAGUE',
  'LOCAL_DESIGN',
  'LOCAL_NOW',
  'SESSION_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'RESEND_API_KEY',
  'CONTACT_EMAIL',
];

/** Optional in local and test, but required in these, so its choice is a decision. */
const mustBeExplicit: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  TRUSTED_PROXY: ['staging', 'production'],
};

/** Optional elsewhere, but required in these environments: where something uses it. */
const requiredIn: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  PLATFORM_DATABASE_URL: ['staging', 'production'],
  SUPABASE_URL: ['staging', 'production'],
  SUPABASE_SECRET_KEY: ['staging', 'production'],
  // Staging may leave out both, switching the bot check off (T-270, record 081); one
  // without the other is refused below.
  TURNSTILE_SITE_KEY: ['production'],
  TURNSTILE_SECRET_KEY: ['production'],
  RESEND_API_KEY: ['production'],
};

/** Read only in local work and tests; set anywhere else, it is a mistake. */
const onlyIn: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  LOCAL_BINNED_TEAM: ['local', 'test'],
  LOCAL_BOT_CHECK: ['local', 'test'],
  LOCAL_DATA: ['local', 'test'],
  LOCAL_DEMO_LEAGUE: ['local', 'test'],
  LOCAL_SIMULATED_LEAGUE: ['local', 'test'],
  LOCAL_DESIGN: ['local', 'test'],
  LOCAL_NOW: ['local', 'test'],
};

/** The settings that name a database or a Supabase project of the platform's own. */
const platformAddresses = ['PLATFORM_DATABASE_URL', 'SUPABASE_URL'] as const;

/** What loadConfig checks the platform's addresses against, beside the environment. */
export type ConfigGuard = {
  /**
   * The project reference of the tracker's Supabase project, from supabase/site.json
   * (config.ts reads it when the app starts, trackerProjectFor), or null when that
   * file could not be read: then staging and production refuse to start, since their
   * addresses cannot be checked against it. That project holds real games; the
   * platform never uses it.
   */
  readonly trackerProject: string | null;
  /**
   * Reads the file PLATFORM_DATABASE_CA names, when it names one (config.ts hands the
   * real one). Without it, only the certificate's own text is taken.
   */
  readonly readFile?: CertificateFileReader;
};

export class ConfigError extends Error {
  readonly missing: readonly string[];
  readonly invalid: readonly string[];
  constructor(missing: readonly string[], invalid: readonly string[]) {
    const lines = [
      ...missing.map((name) => `  ${name}: missing`),
      ...invalid.map((line) => `  ${line}`),
    ];
    super(
      `The app cannot start: ${lines.length} setting(s) are missing or invalid.\n` +
        `${lines.join('\n')}\nSee .env.example for every setting. Values are never printed.`,
    );
    this.name = 'ConfigError';
    this.missing = missing;
    this.invalid = invalid;
  }
}

/** The names of this computer an http public address may use online. */
const thisComputerHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether an address has a path, a query, a fragment or a login beyond its origin. */
function hasMoreThanOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false; // the schema reports it
  }
  return (
    url.pathname !== '/' || url.search !== '' || url.hash !== '' || !!url.username || !!url.password
  );
}

/** Whether `value` is an http address of a host other than this computer. */
function httpAwayFromThisComputer(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    // Not an address at all: the schema names that.
    return false;
  }
  return url.protocol === 'http:' && !thisComputerHosts.has(url.hostname);
}

/**
 * Checks `env` against the schema. Returns the settings, or throws one ConfigError
 * naming every missing or invalid variable. Only names and fixed reasons are put in
 * the error, never the value that was given.
 *
 * The platform's database and Supabase addresses must be neither the tracker's
 * DATABASE_URL nor any address naming the tracker's Supabase project (`guard`), so
 * the app refuses to start before it opens any connection; the tracker's database
 * guard (packages/providers, record 055) says every spelling it refuses. Without a
 * guard (tests of other rules) the project is not compared.
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
  guard?: ConfigGuard,
): Config {
  const given: Record<string, string | undefined> = {};
  for (const name of Object.keys(fields)) {
    const value = env[name];
    given[name] = value === undefined || value.trim() === '' ? undefined : value;
  }
  const missing = new Set<string>();
  const invalid = new Map<string, string>();
  const appEnv = given['APP_ENV'];
  for (const [name, environments] of Object.entries(mustBeExplicit)) {
    if (given[name] === undefined && appEnv !== undefined && environments.includes(appEnv)) {
      invalid.set(name, `${name}: missing, must be set explicitly when APP_ENV is ${appEnv}`);
    }
  }
  for (const [name, environments] of Object.entries(requiredIn)) {
    if (given[name] === undefined && appEnv !== undefined && environments.includes(appEnv)) {
      invalid.set(name, `${name}: missing, must be set when APP_ENV is ${appEnv}`);
    }
  }
  // Turnstile's two keys go together (record 081): staging without either switches the bot
  // check off, but one without the other is a mistake, named here.
  if (appEnv === 'staging') {
    const site = given['TURNSTILE_SITE_KEY'];
    const secret = given['TURNSTILE_SECRET_KEY'];
    if (site !== undefined && secret === undefined) {
      invalid.set(
        'TURNSTILE_SECRET_KEY',
        'TURNSTILE_SECRET_KEY: missing, must be set with TURNSTILE_SITE_KEY (or leave out both to switch the bot check off)',
      );
    }
    if (secret !== undefined && site === undefined) {
      invalid.set(
        'TURNSTILE_SITE_KEY',
        'TURNSTILE_SITE_KEY: missing, must be set with TURNSTILE_SECRET_KEY (or leave out both to switch the bot check off)',
      );
    }
  }
  // Online, the public address is https (the going-online audit's P9, record 082): over
  // http the session cookie loses "Secure" and would be sent in the clear. An http address
  // stays allowed on this computer, where no network lies between (a browser test of the
  // test copy as it starts), and always in local and test.
  const baseUrl = given['PUBLIC_BASE_URL'];
  if (
    (appEnv === 'staging' || appEnv === 'production') &&
    baseUrl !== undefined &&
    httpAwayFromThisComputer(baseUrl)
  ) {
    invalid.set(
      'PUBLIC_BASE_URL',
      `PUBLIC_BASE_URL: invalid, must start with https:// when APP_ENV is ${appEnv}, or the sign-in cookie could be read on the way; set it to the site’s https address (http is allowed only for localhost)`,
    );
  }
  // Online, the public address is only a scheme and host (step 2.203, the 2.110 audit's
  // M2): every address is built from the origin alone (T-34), so a path would be dropped
  // from links without a word. As the worker takes it, which refuses a path everywhere.
  if (
    (appEnv === 'staging' || appEnv === 'production') &&
    baseUrl !== undefined &&
    !invalid.has('PUBLIC_BASE_URL') &&
    hasMoreThanOrigin(baseUrl)
  ) {
    invalid.set(
      'PUBLIC_BASE_URL',
      `PUBLIC_BASE_URL: invalid, must be only a scheme and host, like https://site, when APP_ENV is ${appEnv}: the site has no base path`,
    );
  }
  // The server's certificate: its text, or a file's, read once (step 2.203, T-299).
  const certificate = given['PLATFORM_DATABASE_CA'];
  if (certificate !== undefined && !invalid.has('PLATFORM_DATABASE_CA')) {
    const read = databaseCertificateFrom('PLATFORM_DATABASE_CA', certificate, guard?.readFile);
    given['PLATFORM_DATABASE_CA'] = read.ok ? read.pem : undefined;
    if (!read.ok) invalid.set('PLATFORM_DATABASE_CA', read.problem);
  }
  // The tracker's database guard (packages/providers, shared with the worker).
  const facts: TrackerGuardFacts = { env, appEnv, trackerProject: guard?.trackerProject };
  const database = given['PLATFORM_DATABASE_URL'];
  const databaseProblem =
    database === undefined
      ? undefined
      : platformDatabaseProblem('PLATFORM_DATABASE_URL', database, facts);
  if (databaseProblem !== undefined) invalid.set('PLATFORM_DATABASE_URL', databaseProblem);
  // No SSL only where no network lies between: a database on this computer (record 082).
  if (
    given['PLATFORM_DATABASE_SSL'] === 'off' &&
    (database === undefined || addressOnThisComputer(database) !== true)
  ) {
    invalid.set(
      'PLATFORM_DATABASE_SSL',
      'PLATFORM_DATABASE_SSL: invalid, "off" is allowed only for a database on this computer (an address naming localhost); any other is reached over SSL with its certificate checked',
    );
  }
  if (given['PLATFORM_DATABASE_SSL'] === 'off' && given['PLATFORM_DATABASE_CA'] !== undefined) {
    invalid.set(
      'PLATFORM_DATABASE_CA',
      'PLATFORM_DATABASE_CA: invalid, a certificate is checked only over SSL, and PLATFORM_DATABASE_SSL is "off"',
    );
  }
  const service = given['SUPABASE_URL'];
  const serviceProblem =
    service === undefined ? undefined : platformServiceProblem('SUPABASE_URL', service, facts);
  if (serviceProblem !== undefined) invalid.set('SUPABASE_URL', serviceProblem);
  const fileProblem = trackerProjectProblem(platformAddresses, facts);
  if (fileProblem !== undefined) invalid.set('supabase/site.json', fileProblem);
  // Only for a known APP_ENV: an unknown one is reported as itself, not as this.
  const knownEnv = appEnvs.find((known) => known === appEnv);
  for (const [name, environments] of Object.entries(onlyIn)) {
    if (given[name] !== undefined && knownEnv !== undefined && !environments.includes(knownEnv)) {
      invalid.set(name, `${name}: invalid, may be set only when APP_ENV is local or test`);
    }
  }
  // LOCAL_NOW moves only the stand-in's made-up world (step 2.179): the made-up database
  // keeps this computer's clock, so with it the setting would silently do nothing.
  if (
    given['LOCAL_NOW'] !== undefined &&
    given['LOCAL_DATA'] === 'made-up-database' &&
    !invalid.has('LOCAL_NOW')
  ) {
    invalid.set(
      'LOCAL_NOW',
      'LOCAL_NOW: invalid, the made-up database keeps this computer’s clock, so it may not be set with LOCAL_DATA=made-up-database',
    );
  }
  // The demo-shaped league is loaded into the made-up database only: without it the
  // setting would silently do nothing.
  if (
    given['LOCAL_DEMO_LEAGUE'] === 'on' &&
    given['LOCAL_DATA'] !== 'made-up-database' &&
    !invalid.has('LOCAL_DEMO_LEAGUE')
  ) {
    invalid.set(
      'LOCAL_DEMO_LEAGUE',
      'LOCAL_DEMO_LEAGUE: invalid, the demo-shaped league is loaded into the made-up database only, so it may be on only with LOCAL_DATA=made-up-database',
    );
  }
  // The simulated league is played into the made-up database only, as the demo league is.
  if (
    given['LOCAL_SIMULATED_LEAGUE'] !== undefined &&
    given['LOCAL_SIMULATED_LEAGUE'].trim() !== 'off' &&
    given['LOCAL_DATA'] !== 'made-up-database' &&
    !invalid.has('LOCAL_SIMULATED_LEAGUE')
  ) {
    invalid.set(
      'LOCAL_SIMULATED_LEAGUE',
      'LOCAL_SIMULATED_LEAGUE: invalid, the simulated league is played into the made-up database only, so it may be set only with LOCAL_DATA=made-up-database',
    );
  }
  const result = schema.safeParse(given);
  if (result.success && invalid.size === 0) return Object.freeze(result.data);

  for (const issue of result.success ? [] : result.error.issues) {
    const name = String(issue.path[0]);
    if (given[name] === undefined && !optional.includes(name as ConfigName)) missing.add(name);
    else if (!invalid.has(name)) invalid.set(name, `${name}: invalid, ${reason(issue)}`);
  }
  throw new ConfigError([...missing], [...invalid.values()]);
}

// Fixed wording only: zod's own messages may echo the value for some checks. Our own
// messages (those starting with "must") are written above and contain no values.
function reason(issue: z.core.$ZodIssue): string {
  if (issue.message.startsWith('must')) return issue.message;
  if (issue.code === 'invalid_value') return `not one of the allowed values (${allowed(issue)})`;
  if (issue.code === 'too_small') return 'too short';
  return 'wrong format';
}

/** The values an enum allows, which are ours and never secret (step 2.203, L1). */
function allowed(issue: z.core.$ZodIssue): string {
  const values = 'values' in issue && Array.isArray(issue.values) ? issue.values : [];
  return values.map(String).join(', ');
}
