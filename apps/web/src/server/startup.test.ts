// T-30 and T-60 at startup: the stand-in for local work, and the login check that
// stops staging and production on a database role that could see past the fence.
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle } from '@srleagues/database';
import type {
  EmailConfirmation,
  EmailConfirmationQuestion,
  SignInService,
} from '@srleagues/providers';
import { loadConfig } from './config-schema.ts';
import {
  requireEmailConfirmation,
  startWebApp,
  type DatabasePackage,
  type RealSignInWiring,
  type StartupDeps,
} from './startup.ts';

const env = {
  PUBLIC_BASE_URL: 'http://localhost:3000',
  PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  // Required in staging and production (config-schema.ts).
  TRUSTED_PROXY: 'one',
};
const configFor = (appEnv: string) => loadConfig({ ...env, APP_ENV: appEnv });

/** A sign-in stand-in that gives this answer about email confirmation (step 2.115). */
const answering = (answer: EmailConfirmation | Error): EmailConfirmationQuestion => ({
  emailConfirmation: async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  },
});

/**
 * Start-up's database package and real sign-in service, made up: the login checks answer
 * `problems` and `storeProblems`, the service `confirmation`. What the database ports
 * would use is a function that does nothing (the real wiring is container.test.ts's).
 */
function deps(
  problems: string[] | Error,
  confirmation: EmailConfirmation | Error = 'on',
  storeProblems: string[] | Error = [],
) {
  const close = vi.fn(async () => {});
  const db = { close } as unknown as DatabaseHandle;
  const createDatabase = vi.fn((_source: { kind: 'postgres'; url: string }) => db);
  const checkLoginRole = vi.fn(async (_db: DatabaseHandle) => {
    if (problems instanceof Error) throw problems;
    return problems;
  });
  const checkSignInStoreLogin = vi.fn(async (_db: DatabaseHandle) => {
    if (storeProblems instanceof Error) throw storeProblems;
    return storeProblems;
  });
  const createDatabaseSignInStore = vi.fn(() => ({}));
  const known: Record<string, unknown> = {
    createDatabase,
    checkLoginRole,
    checkSignInStoreLogin,
    createDatabaseSignInStore,
  };
  const database = vi.fn(
    async () =>
      new Proxy(known, {
        // Not a promise: `then` is never made up, or awaiting the package would never end.
        get: (target, name: string) => target[name] ?? (name === 'then' ? undefined : () => ({})),
      }) as unknown as DatabasePackage,
  );
  const realSignIn = vi.fn(
    (_wiring: RealSignInWiring) => answering(confirmation) as unknown as SignInService,
  );
  const given: StartupDeps = { database, realSignIn, log: () => {} };
  return {
    given,
    database,
    createDatabase,
    checkLoginRole,
    checkSignInStoreLogin,
    createDatabaseSignInStore,
    close,
    realSignIn,
  };
}

describe('startWebApp', () => {
  it('runs local work and tests on the stand-in, with no database', async () => {
    for (const appEnv of ['local', 'test']) {
      // Even with a real service that would say "off": local work never asks it.
      const d = deps([], 'off');
      const ports = await startWebApp(configFor(appEnv), d.given);
      expect(await ports.findLeague('north-valley')).toMatchObject({ slug: 'north-valley' });
      expect(d.database).not.toHaveBeenCalled();
      expect(d.realSignIn).not.toHaveBeenCalled();
      // The sign-in stand-in confirms every address, so it would pass the check too.
      await expect(requireEmailConfirmation(ports.signIn)).resolves.toBeUndefined();
    }
  });

  it('runs on the made-up database with LOCAL_DATA=made-up-database (record 055)', async () => {
    const config = loadConfig({ ...env, APP_ENV: 'test', LOCAL_DATA: 'made-up-database' });
    const database = vi.fn(() => import('@srleagues/database'));
    const realSignIn = vi.fn(
      (_wiring: RealSignInWiring) => answering('off') as unknown as SignInService,
    );
    const ports = await startWebApp(config, { database, realSignIn, log: () => {} });
    // Local work signs in on the stand-in: the real service is never asked.
    expect(realSignIn).not.toHaveBeenCalled();
    expect(database).toHaveBeenCalledOnce();
    expect(await ports.findLeague('lakeside')).toMatchObject({ slug: 'lakeside' });
    expect(await ports.findLeague('north-valley')).toBeUndefined();
    // The made-up member signs in on the sign-in stand-in, as on the stand-in.
    const signedIn = await ports.signIn.signIn({
      email: 'member@example.test',
      password: 'made-up member password',
      device: {
        deviceId: 'made-up-device-0000000001',
        label: 'made-up',
        networkAddress: '127.0.0.1',
      },
    });
    if (!signedIn.ok)
      throw new Error(`the made-up member could not sign in: ${signedIn.error.code}`);
    // Who they are is one of the database's own accounts, not the stand-in's user id.
    const who = await ports.identify(signedIn.value.session.accessToken);
    const service = await ports.signIn.identify({
      accessToken: signedIn.value.session.accessToken,
    });
    expect(who.ok && service.ok && who.value.accountId !== service.value.accountId).toBe(true);
    // It carries the local tools (step 2.96), so, as the stand-in, it answers only requests
    // made on this computer: never another computer's on the same network (review, M1).
    expect(ports.localTools).not.toBeNull();
    expect(ports.answers(new Headers({ host: 'localhost:3000' }))).toBe(true);
    for (const host of ['192.168.1.20:3000', 'my-laptop.lan:3000', 'leagues.example.com']) {
      expect(ports.answers(new Headers({ host })), host).toBe(false);
    }
    expect(
      ports.answers(new Headers({ host: 'localhost:3000', 'x-forwarded-for': '192.168.1.30' })),
    ).toBe(false);
    // Its sign-in stand-in would pass the check the real service must pass (step 2.115).
    await expect(requireEmailConfirmation(ports.signIn)).resolves.toBeUndefined();
  }, 120_000);

  it('refuses the made-up database too for a site address that is not local', async () => {
    const d = deps([]);
    const config = loadConfig({
      ...env,
      APP_ENV: 'local',
      LOCAL_DATA: 'made-up-database',
      PUBLIC_BASE_URL: 'https://leagues.example.com',
    });
    await expect(startWebApp(config, d.given)).rejects.toThrow(/PUBLIC_BASE_URL/);
    expect(d.database).not.toHaveBeenCalled();
  });

  it('refuses the stand-in for a site address that is not local or a test name', async () => {
    const d = deps([]);
    const config = loadConfig({
      ...env,
      APP_ENV: 'local',
      PUBLIC_BASE_URL: 'https://leagues.example.com',
    });
    await expect(startWebApp(config, d.given)).rejects.toThrow(/PUBLIC_BASE_URL/);
    expect(d.database).not.toHaveBeenCalled();
  });

  it('checks the login role first in staging and production, and stops on a problem (T-60)', async () => {
    for (const appEnv of ['staging', 'production']) {
      const d = deps(['it is a superuser', 'it bypasses row-level security']);
      await expect(startWebApp(configFor(appEnv), d.given)).rejects.toThrow(
        'The web app cannot start: the database login role is not fit for the app (T-60): ' +
          'it is a superuser; it bypasses row-level security.',
      );
      // Over SSL with the certificate checked: the default (record 081).
      expect(d.createDatabase).toHaveBeenCalledWith({
        kind: 'postgres',
        url: env.PLATFORM_DATABASE_URL,
        ssl: 'verify',
        onIdleError: expect.any(Function),
      });
      expect(d.checkLoginRole).toHaveBeenCalledOnce();
      expect(d.close).toHaveBeenCalledOnce();
    }
  });

  it('stops without repeating the driver message when the database cannot be reached', async () => {
    const d = deps(new Error('connect failed for postgres://app:made-up-password@db'));
    const failure = await startWebApp(configFor('staging'), d.given).catch((e: unknown) => e);
    expect(String(failure)).toMatch(/could not be reached/);
    expect(String(failure)).not.toMatch(/made-up-password/);
    expect(d.close).toHaveBeenCalledOnce();
  });

  it('stops when the login cannot reach the sign-in store, in a plain sentence (record 052)', async () => {
    for (const appEnv of ['staging', 'production']) {
      const d = deps([], 'on', ['it is not a member of sign_in_store']);
      await expect(startWebApp(configFor(appEnv), d.given)).rejects.toThrow(
        'The web app cannot start: the database login cannot reach the sign-in store (record 052): it is not a member of sign_in_store. As the migration login, run "grant sign_in_store to <the app’s login>;" once, then start the app again.',
      );
      expect(d.realSignIn).not.toHaveBeenCalled();
      expect(d.close).toHaveBeenCalledOnce();
    }
    const unreached = deps(
      [],
      'on',
      new Error('connect failed for postgres://app:made-up-password@db'),
    );
    const failure = await startWebApp(configFor('staging'), unreached.given).catch(
      (e: unknown) => e,
    );
    expect(String(failure)).toMatch(/could not be reached to check the sign-in store/);
    expect(String(failure)).not.toMatch(/made-up-password/);
  });

  it('staging serves on the database, through the real sign-in service, after every check', async () => {
    const d = deps([]);
    const ports = await startWebApp(configFor('staging'), d.given);
    expect(ports.madeUpWorld).toBe(false);
    expect(ports.localTools).toBeNull();
    expect(ports.databaseCheck).not.toBeNull();
    // The service start-up asked is the one the app signs people in with.
    expect(ports.signIn).toBe(d.realSignIn.mock.results[0]?.value);
    expect(d.realSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUrl: env.SUPABASE_URL,
        secretKey: env.SUPABASE_SECRET_KEY,
        returnOrigins: [env.PUBLIC_BASE_URL],
        // Only a service on this computer may be reached over plain http.
        allowLocalHttp: false,
      }),
    );
    expect(d.createDatabaseSignInStore).toHaveBeenCalledOnce();
    expect(d.checkLoginRole).toHaveBeenCalledOnce();
    expect(d.checkSignInStoreLogin).toHaveBeenCalledOnce();
    // Open for as long as the server runs.
    expect(d.close).not.toHaveBeenCalled();
  });

  it('production stops after every check has passed, with a plain reason (record 081)', async () => {
    const d = deps([]);
    await expect(startWebApp(configFor('production'), d.given)).rejects.toThrow(
      'The web app cannot start: every check passed, but "production" does not serve anyone yet: only the test copy ("staging") is opened in this stage (record 081), because fixture import does not run on the database yet and youth leagues’ pages are not yet marked "do not index" there (step 2.60).',
    );
    expect(d.checkLoginRole).toHaveBeenCalledOnce();
    expect(d.checkSignInStoreLogin).toHaveBeenCalledOnce();
    expect(d.realSignIn).toHaveBeenCalledOnce();
    expect(d.close).toHaveBeenCalledOnce();
  });
});

describe('email confirmation on the real sign-in service (step 2.115)', () => {
  const off =
    'The web app cannot start: the sign-in service does not confirm email addresses, so anyone could take over an account made in advance by typing its address: turn on "Confirm email" in the Supabase project’s dashboard (Authentication, then Sign In / Providers, then Email), then start the app again.';
  /** The refusal when the service could not say, with the reason it gives. */
  const unknown = (reason: string) =>
    `The web app cannot start: the sign-in service could not say whether it confirms email addresses (${reason}), and the app never starts without that: check that SUPABASE_URL and SUPABASE_SECRET_KEY are the project’s and that it can be reached, and turn on "Confirm email" in the Supabase project’s dashboard (Authentication, then Sign In / Providers, then Email), then start the app again.`;

  /** What an adapter, or the service behind it, might try to slip into the refusal. */
  const serviceWords = 'Invalid API key: sb_secret_made_up_0123, Bearer eyJmade.up.token';
  const madeUpToken = 'eyJmade.up.token';

  /** Nothing about a key, an address, a token or a person, nor the service's words. */
  const expectNothingPrivate = (message: string) => {
    for (const value of [
      env.SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
      env.PLATFORM_DATABASE_URL,
      'made-up-project',
      '@',
      'https://',
      serviceWords,
      'Invalid API key',
      'sb_secret',
      'Bearer',
      madeUpToken,
    ]) {
      expect(message).not.toContain(value);
    }
  };

  const failureOf = async (appEnv: string, d: ReturnType<typeof deps>) => {
    const logged: unknown[] = [];
    const warned: unknown[] = [];
    const failure = await startWebApp(configFor(appEnv), {
      ...d.given,
      log: (line) => logged.push(line),
      warn: (message, fields) => warned.push([message, fields]),
    }).catch((e: unknown) => e);
    if (!(failure instanceof Error)) throw new Error(`${appEnv} started`);
    // Nothing is logged on the way to the refusal.
    expect(logged).toEqual([]);
    expect(warned).toEqual([]);
    return failure;
  };

  it('a stand-in that reports confirmation off makes start-up fail with a plain message', async () => {
    for (const appEnv of ['staging', 'production']) {
      const d = deps([], 'off');
      const failure = await failureOf(appEnv, d);
      expect(failure.name).toBe('StartupError');
      expect(failure.message).toBe(off);
      expectNothingPrivate(failure.message);
      // Asked of the service the settings name, after the login role, and the database closed.
      expect(d.realSignIn).toHaveBeenCalledWith(
        expect.objectContaining({
          projectUrl: env.SUPABASE_URL,
          secretKey: env.SUPABASE_SECRET_KEY,
        }),
      );
      expect(d.checkLoginRole).toHaveBeenCalledOnce();
      expect(d.close).toHaveBeenCalledOnce();
    }
  });

  it('fails the same way when the answer cannot be had: unknown is not yes', async () => {
    for (const appEnv of ['staging', 'production']) {
      const answers: [EmailConfirmation | Error, string][] = [
        [{ unknown: 'key-refused', status: 401 }, 'it refused the key, status 401'],
        [new Error(`no answer from ${env.SUPABASE_URL}`), 'the question itself failed'],
      ];
      for (const [answer, reason] of answers) {
        const d = deps([], answer);
        const failure = await failureOf(appEnv, d);
        expect(failure.message).toBe(unknown(reason));
        expectNothingPrivate(failure.message);
        expect(d.close).toHaveBeenCalledOnce();
      }
    }
  });

  it('says which kind of unknown it was, so a refused key is told from a timeout', async () => {
    const kinds: [EmailConfirmation, string][] = [
      [{ unknown: 'no-answer-in-time' }, 'it did not answer in time'],
      [{ unknown: 'no-connection' }, 'it could not be reached'],
      [{ unknown: 'key-refused', status: 401 }, 'it refused the key, status 401'],
      [{ unknown: 'key-refused', status: 403 }, 'it refused the key, status 403'],
      [{ unknown: 'setting-missing' }, 'it answered without the setting'],
      [{ unknown: 'unexpected-answer', status: 302 }, 'it gave an unexpected answer, status 302'],
      [{ unknown: 'unexpected-answer' }, 'it gave an unexpected answer'],
    ];
    for (const [answer, reason] of kinds) {
      const failure = await requireEmailConfirmation(answering(answer)).catch((e: unknown) => e);
      expect(String(failure)).toBe(`StartupError: ${unknown(reason)}`);
      expectNothingPrivate(String(failure));
    }
  });

  it('lets only a fixed kind and a status number into the sentence, whatever the adapter says', async () => {
    // Answers no adapter should give, as a faulty or hostile one might at run time.
    const odd: unknown[] = [
      'unknown',
      { unknown: serviceWords },
      { unknown: 'toString' },
      { unknown: 'key-refused', status: serviceWords },
      { unknown: 'key-refused', status: 401.5 },
      { unknown: 'key-refused', status: 1e21 },
      { unknown: 'unexpected-answer', status: -302 },
      { unknown: 'setting-missing', words: serviceWords, token: madeUpToken },
      { status: 200 },
      { on: true },
      'yes',
      true,
      null,
      undefined,
      new Error(serviceWords),
    ];
    for (const answer of odd) {
      const adapter = {
        emailConfirmation: async () => answer,
      } as unknown as EmailConfirmationQuestion;
      const failure = await requireEmailConfirmation(adapter).catch((e: unknown) => e);
      // Never yes, and never anything of what the adapter put in.
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toMatch(/could not say whether it confirms email addresses/);
      expectNothingPrivate(String(failure));
      // None of these has a status that is a whole number in HTTP's range.
      expect(String(failure)).not.toMatch(/status/);
    }
  });

  it('with confirmation on, goes past the check: staging starts, production stops after it', async () => {
    await expect(startWebApp(configFor('staging'), deps([], 'on').given)).resolves.toBeDefined();
    const d = deps([], 'on');
    const failure = await failureOf('production', d);
    expect(failure.message).toMatch(/"production" does not serve anyone yet/);
    expect(failure.message).not.toMatch(/confirm/i);
    expect(d.realSignIn).toHaveBeenCalledOnce();
  });

  it('is not asked when the login role already stopped the start', async () => {
    const d = deps(['it is a superuser'], 'off');
    await expect(startWebApp(configFor('staging'), d.given)).rejects.toThrow(/login role/);
    expect(d.realSignIn).not.toHaveBeenCalled();
  });

  it('says in fixed words, never with a value, when the service cannot be set up', async () => {
    const d = deps([]);
    const given: StartupDeps = {
      ...d.given,
      realSignIn: () => {
        throw new Error(`bad address ${env.SUPABASE_URL} with ${env.SUPABASE_SECRET_KEY}`);
      },
    };
    const failure = await startWebApp(configFor('staging'), given).catch((e: unknown) => e);
    expect(String(failure)).toMatch(
      /could not be set up from SUPABASE_URL and SUPABASE_SECRET_KEY/,
    );
    expectNothingPrivate(String(failure));
    expect(d.close).toHaveBeenCalledOnce();
  });

  it('requireEmailConfirmation: on passes; off, unknown and a throw stop it', async () => {
    await expect(requireEmailConfirmation(answering('on'))).resolves.toBeUndefined();
    await expect(requireEmailConfirmation(answering('off'))).rejects.toThrow(off);
    await expect(
      requireEmailConfirmation(answering({ unknown: 'setting-missing' })),
    ).rejects.toThrow(unknown('it answered without the setting'));
    await expect(requireEmailConfirmation(answering(new Error('down')))).rejects.toThrow(
      unknown('the question itself failed'),
    );
  });
});

describe('LOCAL_NOW (step 2.179)', () => {
  // Years from this computer's clock, so the two can never be mistaken for each other.
  const worldStartsAt = '2020-06-01T15:00:00Z';
  const start = () =>
    startWebApp(loadConfig({ ...env, APP_ENV: 'test', LOCAL_NOW: worldStartsAt }), deps([]).given);

  it("starts the made-up world's clock there: the world's today is the setting's day", async () => {
    const ports = await start();
    const league = await ports.findLeague('north-valley');
    if (league === undefined) throw new Error('no made-up league');
    const clock = await ports.publicSchedule.clockOf(league.leagueId);
    expect(clock.today).toBe('2020-06-01');
    // Running on from the setting, not from this computer's clock.
    const gone = Date.parse(clock.now) - Date.parse(worldStartsAt);
    expect(gone).toBeGreaterThanOrEqual(0);
    expect(gone).toBeLessThan(5 * 60_000);
  });

  it("keeps this computer's clock for sign-in, sessions and their renewal", async () => {
    const ports = await start();
    const before = Date.now();
    const signedIn = await ports.signIn.signIn({
      email: 'member@example.test',
      password: 'made-up member password',
      device: {
        deviceId: 'made-up-device-0000000002',
        label: 'made-up',
        networkAddress: '127.0.0.1',
      },
    });
    if (!signedIn.ok)
      throw new Error(`the made-up member could not sign in: ${signedIn.error.code}`);
    const session = signedIn.value.session;
    // Its access lasts from this computer's now, not from 2020.
    expect(session.accessExpiresAt.getTime()).toBeGreaterThan(before);
    expect((await ports.identify(session.accessToken)).ok).toBe(true);
    const renewed = await ports.renewSession(session.refreshToken);
    if (!renewed.ok) throw new Error(`the session could not be renewed: ${renewed.error.code}`);
    expect(renewed.value.accessExpiresAt.getTime()).toBeGreaterThan(before);
    expect((await ports.identify(renewed.value.accessToken)).ok).toBe(true);
  });
});
