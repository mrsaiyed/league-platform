// T-30: every setting and secret the web app needs, and the one function that checks
// them. It takes the environment as an argument and never reads process.env itself,
// so tests can hand it any set of values. config.ts reads the real environment once.
import { z } from 'zod';

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
  LOCAL_DATA: { secret: false },
  SESSION_SECRET: { secret: true },
  SUPABASE_URL: { secret: false },
  SUPABASE_SECRET_KEY: { secret: true },
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
  // Whether X-Forwarded-For is believed for the sign-in attempt limits (record 031):
  // 'none' never; 'one' when exactly one proxy of the host appends the address it
  // was reached from. The default 'none' is for local and test only: in staging and
  // production it must be set (mustBeExplicit), because with 'none' every visitor
  // shares one address and one person's wrong guesses lock out everyone.
  TRUSTED_PROXY: z.enum(['none', 'one']).default('none'),
  // The platform's own database (R8): not DATABASE_URL, which the Al-Hadi tracker
  // reads, so a settings file made for the tracker can never point the web app at the
  // tracker's database. Local work and tests never open an address (T-201), so it is
  // needed only in staging and production.
  PLATFORM_DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(?:ql)?:\/\//, 'must be a postgres:// address')
    .optional(),
  // What local work and tests run on (record 055): 'stand-in', the made-up leagues in
  // this process's memory (the default), or 'made-up-database', the made-up seed
  // leagues in a database in memory with every migration. Only local and test read it.
  LOCAL_DATA: z.enum(['stand-in', 'made-up-database']).default('stand-in'),
  // Nothing uses these yet (R8): each becomes required, where it is used, with the
  // step that first uses it. Given now, they are still checked.
  SESSION_SECRET: secretText(32).optional(),
  STRIPE_SECRET_KEY: secretText(8).optional(),
  STRIPE_WEBHOOK_SECRET: secretText(8).optional(),
  // The sign-in service (record 018): staging and production only; local work and
  // tests sign in on the stand-in.
  SUPABASE_URL: webUrl.optional(),
  SUPABASE_SECRET_KEY: secretText(16).optional(),
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
  'LOCAL_DATA',
  'SESSION_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
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
  RESEND_API_KEY: ['production'],
};

/** Read only in local work and tests; set anywhere else, it is a mistake. */
const onlyIn: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  LOCAL_DATA: ['local', 'test'],
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
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
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
  // Only for a known APP_ENV: an unknown one is reported as itself, not as this.
  const knownEnv = appEnvs.find((known) => known === appEnv);
  for (const [name, environments] of Object.entries(onlyIn)) {
    if (given[name] !== undefined && knownEnv !== undefined && !environments.includes(knownEnv)) {
      invalid.set(name, `${name}: invalid, may be set only when APP_ENV is local or test`);
    }
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
