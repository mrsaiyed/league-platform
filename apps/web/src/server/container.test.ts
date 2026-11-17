// The real wiring of container.ts in staging and production mode (step 2.93's last part;
// the review of step 2.115 found no test started it). Nothing is replaced but the world
// outside: the settings are read from the environment by config.ts, packages/database is
// loaded as the app loads it and reaches the made-up seed database over a `postgres://`
// address through `pg` (serveMadeUpDatabase: on 127.0.0.1, made-up data only), and the
// sign-in service is Supabase's adapter speaking HTTP to a local fake of Supabase Auth
// (serveFakeSupabaseAuth), with made-up keys. Every stand-in the app has is made to throw
// if it is reached at all, so a fall back to one anywhere fails the test.
//
// Then: a person signs up by the code, chooses a password and signs in through the real
// adapter, their sessions are listed by device, one signs out, the rest everywhere; a
// restart signs nobody out (the store is in the database). And each start-up refusal is
// met for real, in its own plain sentence with no key, password or address in it.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type DatabaseModule = typeof import('@srleagues/database');

/** The stand-ins reached, by name: must stay empty in staging and production. */
const standInsReached: string[] = [];

/** A module whose every function export throws, and is written down, if it is called. */
async function throwingFunctions<T extends Record<string, unknown>>(
  label: string,
  original: () => Promise<T>,
  only?: readonly string[],
): Promise<T> {
  const module = await original();
  const wrapped: Record<string, unknown> = { ...module };
  for (const [name, value] of Object.entries(module)) {
    if (typeof value !== 'function' || (only !== undefined && !only.includes(name))) continue;
    // Classes (errors) are kept: only what makes or runs a stand-in is refused.
    if (/^[A-Z]/.test(name)) continue;
    wrapped[name] = () => {
      standInsReached.push(`${label}.${name}`);
      throw new Error(`a stand-in was reached in a deployed mode: ${label}.${name}`);
    };
  }
  return wrapped as T;
}

vi.mock('./stand-in-ports.ts', (original) =>
  throwingFunctions('stand-in-ports', original as () => Promise<Record<string, unknown>>),
);
vi.mock('./stand-in-world.ts', (original) =>
  throwingFunctions('stand-in-world', original as () => Promise<Record<string, unknown>>),
);
vi.mock('./made-up-database-people.ts', (original) =>
  throwingFunctions('made-up-database-people', original as () => Promise<Record<string, unknown>>),
);
vi.mock('@srleagues/database', (original) =>
  throwingFunctions('database', original as () => Promise<Record<string, unknown>>, [
    'madeUpDatabase',
  ]),
);
vi.mock('@srleagues/providers', (original) =>
  throwingFunctions('providers', original as () => Promise<Record<string, unknown>>, [
    'createLocalSignInStandIn',
    'createMemorySignInStore',
    'createSignInCodeCapture',
  ]),
);

let database: DatabaseModule;
let providers: typeof import('@srleagues/providers');

beforeAll(async () => {
  database = (await vi.importActual('@srleagues/database')) as DatabaseModule;
  providers = await vi.importActual('@srleagues/providers');
});

/** Made-up keys only: neither is anyone's. */
const secretKey = 'made-up-supabase-secret-key-for-the-wiring-test';
const here = '127.0.0.1';
const device = (n: number) => ({
  deviceId: `wiring-test-device-${String(n).padStart(8, '0')}`,
  label: `Made-up phone ${n}`,
  networkAddress: here,
});

const open: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  for (const thing of open.splice(0)) await thing.close();
  vi.unstubAllEnvs();
  delete (globalThis as Record<string, unknown>)['__srleaguesWebPorts'];
  standInsReached.length = 0;
});

type Setting = Record<string, string | undefined>;

/** Starts the app as container.ts does, with these settings, in a fresh module state. */
async function webPortsWith(settings: Setting) {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>)['__srleaguesWebPorts'];
  for (const name of Object.keys(settings)) vi.stubEnv(name, settings[name]);
  const { webPorts } = await import('./container.ts');
  return webPorts();
}

/** A made-up database and a fake sign-in service, both on this computer. */
async function world(
  options: {
    login?: 'fit' | 'superuser' | 'no-sign-in-store';
    mailerAutoconfirm?: boolean;
  } = {},
) {
  const served = await database.serveMadeUpDatabase({
    underWay: true,
    ...(options.login === undefined ? {} : { login: options.login }),
  });
  open.push(served);
  const auth = await providers.serveFakeSupabaseAuth({
    secretKey,
    ...(options.mailerAutoconfirm === undefined
      ? {}
      : { mailerAutoconfirm: options.mailerAutoconfirm }),
  });
  open.push(auth);
  const settings: Setting = {
    APP_ENV: 'staging',
    PUBLIC_BASE_URL: 'http://localhost:3999',
    LOG_LEVEL: 'error',
    TRUSTED_PROXY: 'none',
    PLATFORM_DATABASE_URL: served.url,
    PLATFORM_DATABASE_SSL: 'off',
    SUPABASE_URL: auth.url,
    SUPABASE_SECRET_KEY: secretKey,
    EMAIL_FROM: 'hello@example.test',
    // Never one of these from the shell this runs in.
    LOCAL_DATA: undefined,
    LOCAL_DESIGN: undefined,
    LOCAL_NOW: undefined,
    RESEND_API_KEY: undefined,
    DATABASE_URL: undefined,
  };
  return { served, auth, settings };
}

/** The refusal a start with these settings ends in. */
async function refusal(settings: Setting): Promise<string> {
  const failure = await webPortsWith(settings).then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(failure instanceof Error)) throw new Error('the app started');
  expect(failure.message, 'a key, a password or an address').not.toMatch(
    new RegExp(`${secretKey}|made-up-password|postgres://|http://localhost`),
  );
  return failure.message;
}

describe('container.ts in staging, wired for real', () => {
  it('starts on the database through the real sign-in service, with no stand-in anywhere', async () => {
    const { auth, settings } = await world();
    const ports = await webPortsWith(settings);
    expect(standInsReached).toEqual([]);
    expect(ports.madeUpWorld).toBe(false);
    expect(ports.localTools).toBeNull();
    // A real database answers every request: nothing is kept to this computer's names.
    expect(ports.answers(new Headers({ host: 'leagues.example.com' }))).toBe(true);
    // The seed leagues are there, read from the database over the network.
    expect(await ports.findLeague('lakeside')).toMatchObject({ slug: 'lakeside' });
    expect(await ports.findLeague('north-valley')).toBeUndefined();
    // The health check asks the database itself.
    expect(await ports.databaseCheck?.()).toBe(true);
    // The service was asked whether it confirms addresses before anything else of it.
    expect(auth.callsTo('GET', '/settings')).toBe(1);
    // The one area not on the database refuses rather than falling back.
    expect(() => ports.fixtureImport.deps).toThrow(/not on the database yet|database/i);
    expect(standInsReached).toEqual([]);
  }, 120_000);

  it('signs a person up by the emailed code and in through the real adapter; sessions, devices and sign-out work; a restart signs nobody out', async () => {
    const { auth, settings } = await world();
    const ports = await webPortsWith(settings);
    const email = `wiring-${Date.now().toString(36)}@example.test`;
    const password = 'a made-up chosen password';

    expect((await ports.signIn.startSignUp({ email, networkAddress: here })).ok).toBe(true);
    const code = auth.codeFor(email);
    expect(code).toMatch(/^\d{6}$/);
    // A wrong code is refused and counted, as on the stand-in.
    const wrong = code === '000000' ? '111111' : '000000';
    const refused = await ports.signIn.verifyCode({ email, code: wrong, networkAddress: here });
    expect(refused.ok ? 'ok' : refused.error.code).toBe('code-wrong');
    const proved = await ports.signIn.verifyCode({ email, code: code ?? '', networkAddress: here });
    if (!proved.ok) throw new Error(`the code was refused: ${proved.error.code}`);
    const made = await ports.signIn.setPassword({
      proof: proved.value.proof,
      password,
      device: device(1),
    });
    if (!made.ok) throw new Error(`the password was refused: ${made.error.code}`);
    expect(made.value.outcome).toBe('account-created');

    // Who they are is one of the database's own accounts, made for them on first sight.
    const first = made.value.session;
    const who = await ports.identify(first.accessToken);
    if (!who.ok) throw new Error(`not identified: ${who.error.code}`);
    expect(who.value.email).toBe(email);
    expect(who.value.accountId).not.toBe(made.value.accountId);

    // Signed in again on a second phone: a new device, and two sessions listed.
    const second = await ports.signIn.signIn({ email, password, device: device(2) });
    if (!second.ok) throw new Error(`could not sign in: ${second.error.code}`);
    expect(second.value.newDevice).toBe(true);
    const wrongPassword = await ports.signIn.signIn({
      email,
      password: 'not the made-up password',
      device: device(3),
    });
    expect(wrongPassword.ok ? 'ok' : wrongPassword.error.code).toBe('wrong-email-or-password');
    const listed = await ports.signIn.listSessions({
      accessToken: second.value.session.accessToken,
    });
    if (!listed.ok) throw new Error('no list');
    expect(listed.value.map((s) => [s.deviceLabel, s.current])).toEqual([
      ['Made-up phone 2', true],
      ['Made-up phone 1', false],
    ]);

    // A renewal through the shared one, then a restart: the store is the database's, so
    // the session lives on in a new server process.
    const renewed = await ports.renewSession(second.value.session.refreshToken);
    if (!renewed.ok) throw new Error(`not renewed: ${renewed.error.code}`);
    const restarted = await webPortsWith(settings);
    expect(restarted).not.toBe(ports);
    const still = await restarted.identify(renewed.value.accessToken);
    expect(still.ok && still.value.accountId).toBe(who.value.accountId);

    // Signing out the first phone ends that session only.
    expect(await restarted.signIn.signOut({ accessToken: first.accessToken })).toMatchObject({
      ok: true,
      value: { ended: true },
    });
    expect((await restarted.identify(first.accessToken)).ok).toBe(false);
    const after = await restarted.signIn.listSessions({ accessToken: renewed.value.accessToken });
    expect(after.ok && after.value.map((s) => s.deviceLabel)).toEqual(['Made-up phone 2']);
    // And everywhere: the last one too.
    const everywhere = await restarted.signIn.signOutEverywhere({
      accessToken: renewed.value.accessToken,
      keepThisSession: false,
    });
    expect(everywhere.ok).toBe(true);
    expect((await restarted.identify(renewed.value.accessToken)).ok).toBe(false);
    expect(standInsReached).toEqual([]);
  }, 180_000);
});

describe('container.ts in production, wired for real', () => {
  it('stops after every check has passed, in its plain sentence (record 081)', async () => {
    const { auth, settings } = await world();
    const message = await refusal({
      ...settings,
      APP_ENV: 'production',
      PUBLIC_BASE_URL: 'https://leagues.example.test',
      TRUSTED_PROXY: 'one',
      RESEND_API_KEY: 'made-up-resend-key-never-used',
    });
    expect(message).toBe(
      'The web app cannot start: every check passed, but "production" does not serve anyone yet: only the test copy ("staging") is opened in this stage (record 081), because fixture import does not run on the database yet and youth leagues’ pages are not yet marked "do not index" there (step 2.60).',
    );
    // It got that far: the service was asked, as in staging.
    expect(auth.callsTo('GET', '/settings')).toBe(1);
    expect(message).not.toContain('made-up-resend-key');
    expect(standInsReached).toEqual([]);
  }, 120_000);
});

describe('what stops the test copy from starting, each in a plain sentence', () => {
  it('a database that cannot be reached', async () => {
    const { settings } = await world();
    // A port nothing listens on, on this computer.
    const message = await refusal({
      ...settings,
      PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:1/nowhere',
    });
    expect(message).toBe(
      'The web app cannot start: the database could not be reached to check its login role.',
    );
  }, 120_000);

  it('a database reached without SSL while the setting asks for it (the default)', async () => {
    const { settings } = await world();
    const message = await refusal({ ...settings, PLATFORM_DATABASE_SSL: undefined });
    expect(message).toBe(
      'The web app cannot start: the database could not be reached to check its login role.',
    );
  }, 120_000);

  it('a login role that could see past the fence (T-60)', async () => {
    const { settings } = await world({ login: 'superuser' });
    expect(await refusal(settings)).toBe(
      'The web app cannot start: the database login role is not fit for the app (T-60): it is a superuser; it bypasses row-level security; it owns tables in public, or can act as their owner.',
    );
  }, 120_000);

  it('a login that cannot reach the sign-in store (record 052)', async () => {
    const { auth, settings } = await world({ login: 'no-sign-in-store' });
    expect(await refusal(settings)).toBe(
      'The web app cannot start: the database login cannot reach the sign-in store (record 052): it is not a member of sign_in_store. As the migration login, run "grant sign_in_store to <the app’s login>;" once, then start the app again.',
    );
    // The sign-in service is not asked anything before the database is fit.
    expect(auth.callsTo('GET', '/settings')).toBe(0);
  }, 120_000);

  it('email confirmation off at the service (step 2.115)', async () => {
    const { settings } = await world({ mailerAutoconfirm: true });
    expect(await refusal(settings)).toMatch(
      /^The web app cannot start: the sign-in service does not confirm email addresses, so anyone could take over an account made in advance by typing its address: turn on "Confirm email"/,
    );
  }, 120_000);

  it('email confirmation unknown: the key refused, or the service not reached', async () => {
    const { settings } = await world();
    expect(
      await refusal({ ...settings, SUPABASE_SECRET_KEY: 'made-up-but-not-the-fakes-key' }),
    ).toMatch(
      /could not say whether it confirms email addresses \(it refused the key, status 401\)/,
    );
    expect(await refusal({ ...settings, SUPABASE_URL: 'http://localhost:1' })).toMatch(
      /could not say whether it confirms email addresses \(it could not be reached\)/,
    );
  }, 120_000);

  it('a setting missing, and settings that are wrong', async () => {
    const { settings } = await world();
    expect(await refusal({ ...settings, SUPABASE_URL: undefined })).toContain(
      'SUPABASE_URL: missing, must be set when APP_ENV is staging',
    );
    expect(await refusal({ ...settings, TRUSTED_PROXY: undefined })).toContain(
      'TRUSTED_PROXY: missing, must be set explicitly when APP_ENV is staging',
    );
    expect(
      await refusal({
        ...settings,
        PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@db.made-up.example.test/x',
      }),
    ).toContain(
      'PLATFORM_DATABASE_SSL: invalid, "off" is allowed only for a database on this computer',
    );
    expect(await refusal({ ...settings, LOCAL_DATA: 'made-up-database' })).toContain(
      'LOCAL_DATA: invalid, may be set only when APP_ENV is local or test',
    );
    // Plain http to a sign-in service anywhere but this computer: the adapter refuses it.
    expect(await refusal({ ...settings, SUPABASE_URL: 'http://auth.made-up.example.test' })).toBe(
      'The web app cannot start: the sign-in service could not be set up from SUPABASE_URL and SUPABASE_SECRET_KEY: the address must be the project’s https address and the key its secret key.',
    );
  }, 180_000);
});
