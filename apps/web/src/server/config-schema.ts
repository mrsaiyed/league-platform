// T-30: every setting and secret the web app needs, and the one function that checks
// them. It takes the environment as an argument and never reads process.env itself,
// so tests can hand it any set of values. config.ts reads the real environment once.
import {
  platformDatabaseProblem,
  platformServiceProblem,
  trackerProjectProblem,
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

/** Every variable, with whether it is secret. `.env.example` lists the same names. */
export const fields = {
  APP_ENV: { secret: false },
  PUBLIC_BASE_URL: { secret: false },
  LOG_LEVEL: { secret: false },
  TRUSTED_PROXY: { secret: false },
  PLATFORM_DATABASE_URL: { secret: true },
  LOCAL_BINNED_TEAM: { secret: false },
  LOCAL_DATA: { secret: false },
  LOCAL_DEMO_LEAGUE: { secret: false },
  LOCAL_DESIGN: { secret: false },
  LOCAL_NOW: { secret: false },
  SESSION_SECRET: { secret: true },
  SUPABASE_URL: { secret: false },
  SUPABASE_SECRET_KEY: { secret: true },
  TURNSTILE_SITE_KEY: { secret: false },
  TURNSTILE_SECRET_KEY: { secret: true },
  RESEND_API_KEY: { secret: true },
  EMAIL_FROM: { secret: false },
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
  LOCAL_DATA: z.enum(['stand-in', 'made-up-database']).default('stand-in'),
  // 'on' loads the seed's demo-shaped league into the made-up database too (step 2.59): a
  // large league with a whole season, which takes some seconds at start. Off by default, so
  // a test that does not look at it starts as fast as before. Only with LOCAL_DATA=
  // made-up-database, and only local and test: a choice of the made-up data, no setting of
  // the product.
  LOCAL_DEMO_LEAGUE: z.enum(['on', 'off']).default('off'),
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
});

export type Config = Readonly<z.infer<typeof schema>>;

/** Optional variables: absent or blank means "use the default" or "none", not "missing". */
const optional: readonly ConfigName[] = [
  'LOG_LEVEL',
  'TRUSTED_PROXY',
  'PLATFORM_DATABASE_URL',
  'LOCAL_BINNED_TEAM',
  'LOCAL_DATA',
  'LOCAL_DEMO_LEAGUE',
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
  LOCAL_DATA: ['local', 'test'],
  LOCAL_DEMO_LEAGUE: ['local', 'test'],
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
  // The tracker's database guard (packages/providers, shared with the worker).
  const facts: TrackerGuardFacts = { env, appEnv, trackerProject: guard?.trackerProject };
  const database = given['PLATFORM_DATABASE_URL'];
  const databaseProblem =
    database === undefined
      ? undefined
      : platformDatabaseProblem('PLATFORM_DATABASE_URL', database, facts);
  if (databaseProblem !== undefined) invalid.set('PLATFORM_DATABASE_URL', databaseProblem);
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
  if (issue.code === 'invalid_value') return 'not one of the allowed values';
  if (issue.code === 'too_small') return 'too short';
  return 'wrong format';
}
