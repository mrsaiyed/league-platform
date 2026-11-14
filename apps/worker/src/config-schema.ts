// T-30: every setting and secret the worker needs, and the one function that checks
// them. It takes the environment as an argument and never reads process.env itself,
// so tests can hand it any set of values; config.ts reads the real environment once.
// Names shared with the web app mean the same thing in both (.env.example).
import { z } from 'zod';

/** Every variable, with whether it is secret. `.env.example` lists the same names. */
export const workerFields = {
  APP_ENV: { secret: false },
  LOG_LEVEL: { secret: false },
  DATABASE_URL: { secret: true },
  PUBLIC_BASE_URL: { secret: false },
  EMAIL_FROM: { secret: false },
  RESEND_API_KEY: { secret: true },
  EMAIL_CAPTURE_DIR: { secret: false },
  WORKER_HEALTH_PORT: { secret: false },
} as const satisfies Record<string, { secret: boolean }>;

export type WorkerConfigName = keyof typeof workerFields;

/** The port the health check listens on when WORKER_HEALTH_PORT is not set. */
export const defaultHealthPort = 3001;

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Local work and tests never open an address: they run on a made-up database in
  // memory (T-201), so DATABASE_URL is needed only in staging and production.
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(?:ql)?:\/\//, 'must be a postgres:// address')
    .optional(),
  // The web app has no base path (its addresses are built from the origin alone, T-34,
  // and it refuses a PUBLIC_BASE_URL with a path when it builds them), so the worker
  // takes only a scheme and host too, rather than quietly dropping a path from links.
  PUBLIC_BASE_URL: z
    .url()
    .regex(/^https?:\/\//i, 'must be an http or https address')
    .refine(isBareOrigin, 'must be only a scheme and host, like https://site'),
  EMAIL_FROM: z
    .string()
    .trim()
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'must be an email address'),
  // Only production sends email (T-140); elsewhere it is captured.
  RESEND_API_KEY: z.string().trim().min(8, 'must be at least 8 characters').optional(),
  EMAIL_CAPTURE_DIR: z.string().trim().min(1).optional(),
  WORKER_HEALTH_PORT: z.coerce
    .number()
    .int('must be a whole number')
    .min(0, 'must be a port from 0 to 65535')
    .max(65535, 'must be a port from 0 to 65535')
    .default(defaultHealthPort),
});

function isBareOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false; // z.url() has reported it already
  }
  return (
    url.pathname === '/' && url.search === '' && url.hash === '' && !url.username && !url.password
  );
}

export type WorkerConfig = Readonly<z.infer<typeof schema>>;

/** Variables that may be left out: absent or blank means "use the default" or "none". */
const optional: readonly WorkerConfigName[] = [
  'LOG_LEVEL',
  'DATABASE_URL',
  'RESEND_API_KEY',
  'EMAIL_CAPTURE_DIR',
  'WORKER_HEALTH_PORT',
];

/** Optional elsewhere, but required in these environments. */
const requiredIn: Readonly<Partial<Record<WorkerConfigName, readonly string[]>>> = {
  DATABASE_URL: ['staging', 'production'],
  RESEND_API_KEY: ['production'],
};

/** WORKER_HEALTH_PORT 0 (any free port) is for tests only: a host must know the port. */
const anyPortOnlyIn: readonly string[] = ['test'];

export class WorkerConfigError extends Error {
  readonly missing: readonly string[];
  readonly invalid: readonly string[];
  constructor(missing: readonly string[], invalid: readonly string[]) {
    const lines = [
      ...missing.map((name) => `  ${name}: missing`),
      ...invalid.map((line) => `  ${line}`),
    ];
    super(
      `The worker cannot start: ${lines.length} setting(s) are missing or invalid.\n` +
        `${lines.join('\n')}\nSee .env.example for every setting. Values are never printed.`,
    );
    this.name = 'WorkerConfigError';
    this.missing = missing;
    this.invalid = invalid;
  }
}

/**
 * Checks `env` against the schema. Returns the settings, or throws one
 * WorkerConfigError naming every missing or invalid variable. Only names and fixed
 * reasons are put in the error, never the value that was given.
 */
export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  const given: Record<string, string | undefined> = {};
  for (const name of Object.keys(workerFields)) {
    const value = env[name];
    given[name] = value === undefined || value.trim() === '' ? undefined : value;
  }
  const missing = new Set<string>();
  const invalid = new Map<string, string>();
  const appEnv = given['APP_ENV'];
  for (const [name, environments] of Object.entries(requiredIn)) {
    if (given[name] === undefined && appEnv !== undefined && environments.includes(appEnv)) {
      invalid.set(name, `${name}: missing, must be set when APP_ENV is ${appEnv}`);
    }
  }
  const result = schema.safeParse(given);
  if (
    result.success &&
    result.data.WORKER_HEALTH_PORT === 0 &&
    !anyPortOnlyIn.includes(result.data.APP_ENV)
  ) {
    invalid.set(
      'WORKER_HEALTH_PORT',
      'WORKER_HEALTH_PORT: invalid, may be 0 only when APP_ENV is test',
    );
  }
  if (result.success && invalid.size === 0) return Object.freeze(result.data);

  for (const issue of result.success ? [] : result.error.issues) {
    const name = String(issue.path[0]);
    if (given[name] === undefined && !optional.includes(name as WorkerConfigName)) {
      missing.add(name);
    } else if (!invalid.has(name)) invalid.set(name, `${name}: invalid, ${reason(issue)}`);
  }
  throw new WorkerConfigError([...missing], [...invalid.values()]);
}

// Fixed wording only: zod's own messages may echo the value for some checks. Our own
// messages (those starting with "must") are written above and contain no values.
function reason(issue: z.core.$ZodIssue): string {
  if (issue.message.startsWith('must')) return issue.message;
  if (issue.code === 'invalid_value') return 'not one of the allowed values';
  if (issue.code === 'too_small' || issue.code === 'too_big') return 'out of range';
  return 'wrong format';
}
