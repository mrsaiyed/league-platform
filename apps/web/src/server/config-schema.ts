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
  DATABASE_URL: { secret: true },
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

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
  PUBLIC_BASE_URL: webUrl,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Whether X-Forwarded-For is believed for the sign-in attempt limits (record 031):
  // 'none' never; 'one' when exactly one proxy of the host appends the address it
  // was reached from. The default 'none' is for local and test only: in staging and
  // production it must be set (mustBeExplicit), because with 'none' every visitor
  // shares one address and one person's wrong guesses lock out everyone.
  TRUSTED_PROXY: z.enum(['none', 'one']).default('none'),
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(?:ql)?:\/\//, 'must be a postgres:// address'),
  SESSION_SECRET: secretText(32),
  SUPABASE_URL: webUrl,
  SUPABASE_SECRET_KEY: secretText(16),
  RESEND_API_KEY: secretText(8),
  EMAIL_FROM: text.regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'must be an email address'),
  STRIPE_SECRET_KEY: secretText(8),
  STRIPE_WEBHOOK_SECRET: secretText(8),
});

export type Config = Readonly<z.infer<typeof schema>>;

/** Optional variables: absent or blank means "use the default", not "missing". */
const optional: readonly ConfigName[] = ['LOG_LEVEL', 'TRUSTED_PROXY'];

/** Optional in local and test, but required in these, so its choice is a decision. */
const mustBeExplicit: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  TRUSTED_PROXY: ['staging', 'production'],
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
  for (const [name, environments] of Object.entries(mustBeExplicit)) {
    const appEnv = given['APP_ENV'];
    if (given[name] === undefined && appEnv !== undefined && environments.includes(appEnv)) {
      invalid.set(name, `${name}: missing, must be set explicitly when APP_ENV is ${appEnv}`);
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
