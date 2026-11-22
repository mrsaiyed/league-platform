// T-30 and T-60 at startup: the stand-in for local work, and the login check that
// stops staging and production on a database role that could see past the fence.
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle } from '@srleagues/database';
import type { EmailConfirmation, EmailConfirmationQuestion } from '@srleagues/providers';
import { createLogger } from '@srleagues/observability';
import { loadConfig } from './config-schema.ts';
import { logLinesFor } from './container.ts';
import {
  botCheckAlarmLine,
  botCheckOffLine,
  hostedBotCheck,
  requireEmailConfirmation,
  startWebApp,
  type DatabasePackage,
  type RealSignInSettings,
  type StartupDeps,
} from './startup.ts';

const env = {
  PUBLIC_BASE_URL: 'http://localhost:3000',
  PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  TURNSTILE_SITE_KEY: 'made-up-turnstile-site-key',
  TURNSTILE_SECRET_KEY: 'made-up-turnstile-secret-key',
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

function deps(problems: string[] | Error, confirmation: EmailConfirmation | Error = 'on') {
  const close = vi.fn(async () => {});
  const db = { close } as unknown as DatabaseHandle;
  const createDatabase = vi.fn((_source: { kind: 'postgres'; url: string }) => db);
  const checkLoginRole = vi.fn(async (_db: DatabaseHandle) => {
    if (problems instanceof Error) throw problems;
    return problems;
  });
  // Only these two are reached in staging and production today.
  const database = vi.fn(
    async () => ({ createDatabase, checkLoginRole }) as unknown as DatabasePackage,
  );
  const realSignIn = vi.fn((_service: RealSignInSettings) => answering(confirmation));
  const given: StartupDeps = { database, realSignIn, log: () => {} };
  return { given, database, createDatabase, checkLoginRole, close, realSignIn };
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
    const realSignIn = vi.fn((_service: RealSignInSettings) => answering('off'));
    const ports = await startWebApp(config, { database, realSignIn, log: () => {} });
    // Local work signs in on the stand-in: the real service is never asked.
    expect(realSignIn).not.toHaveBeenCalled();
    expect(database).toHaveBeenCalledOnce();
    expect(await ports.findLeague('lakeside')).toMatchObject({ slug: 'lakeside' });
    expect(await ports.findLeague('north-valley')).toBeUndefined();
    // The seed's demo-shaped league is loaded only when asked (LOCAL_DEMO_LEAGUE, step 2.59).
    const { demoLeague } = await import('@srleagues/database');
    expect(await ports.findLeague(demoLeague.slug)).toBeUndefined();
    const listed = (await ports.localTools?.madeUpPeople()) ?? [];
    expect(listed.some((p) => p.email === demoLeague.owner.email)).toBe(false);
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

  it('loads the demo-shaped league too with LOCAL_DEMO_LEAGUE=on (step 2.59)', async () => {
    const config = loadConfig({
      ...env,
      APP_ENV: 'test',
      LOCAL_DATA: 'made-up-database',
      LOCAL_DEMO_LEAGUE: 'on',
    });
    const database = vi.fn(() => import('@srleagues/database'));
    const realSignIn = vi.fn((_service: RealSignInSettings) => answering('off'));
    const ports = await startWebApp(config, { database, realSignIn, log: () => {} });
    const { demoLeague } = await import('@srleagues/database');
    expect(await ports.findLeague(demoLeague.slug)).toMatchObject({ slug: demoLeague.slug });
    expect(await ports.findLeague('lakeside')).toMatchObject({ slug: 'lakeside' });
    // "Be this made-up person" lists its owner and one scorekeeper, besides the seed's.
    const listed = (await ports.localTools?.madeUpPeople()) ?? [];
    const inDemo = listed.filter((p) => p.places.some((place) => place.slug === demoLeague.slug));
    expect(inDemo.map((p) => [p.email, p.places.flatMap((place) => place.memberships)])).toEqual([
      [demoLeague.owner.email, ['owner']],
      [demoLeague.members.find((m) => m.role === 'scorekeeper')?.email, ['scorekeeper']],
    ]);
    expect(listed.some((p) => p.email === 'owner@lakeside.example.test')).toBe(true);
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
      expect(d.createDatabase).toHaveBeenCalledWith({
        kind: 'postgres',
        url: env.PLATFORM_DATABASE_URL,
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

  it('stops with a plain reason after a good check, until real sign-in is wired', async () => {
    const d = deps([]);
    await expect(startWebApp(configFor('production'), d.given)).rejects.toThrow(
      /sign-in on the real service is not wired yet/,
    );
    expect(d.checkLoginRole).toHaveBeenCalledOnce();
    expect(d.realSignIn).toHaveBeenCalledOnce();
  });
});

describe("staging's bot check (record 081, T-270)", () => {
  /** Starts staging as far as it goes today, and gives back what it warned. */
  async function warnedIn(settings: Record<string, string | undefined>) {
    const d = deps([]);
    const warned: unknown[] = [];
    const config = loadConfig({ ...env, APP_ENV: 'staging', ...settings });
    await startWebApp(config, { ...d.given, warn: (m, f) => warned.push([m, f]) }).catch(
      () => undefined,
    );
    return warned;
  }

  it('without either Turnstile key starts with the check off, and says so in one plain line', async () => {
    const warned = await warnedIn({
      TURNSTILE_SITE_KEY: undefined,
      TURNSTILE_SECRET_KEY: undefined,
    });
    expect(warned).toEqual([[botCheckOffLine, {}]]);
    expect(botCheckOffLine).not.toMatch(/made-up/);
    expect(
      hostedBotCheck(
        loadConfig({
          ...env,
          APP_ENV: 'staging',
          TURNSTILE_SITE_KEY: undefined,
          TURNSTILE_SECRET_KEY: undefined,
        }),
        {},
      ).widget.kind,
    ).toBe('off');
  });

  it('with both keys uses Turnstile and says nothing', async () => {
    expect(await warnedIn({})).toEqual([]);
    expect(hostedBotCheck(configFor('staging'), {}).widget.kind).toBe('turnstile');
  });

  it('reports a check it could not ask in one error-level line of a fixed shape (Q2)', async () => {
    const alarmed: [string, Readonly<Record<string, string>>][] = [];
    const warned: unknown[] = [];
    const check = hostedBotCheck(
      configFor('production'),
      {
        alarm: (message, fields) => void alarmed.push([message, fields]),
        warn: (m) => void warned.push(m),
      },
      async () => {
        throw new TypeError('fetch failed: 192.0.2.10');
      },
    );
    expect(await check.verify({ answer: 'made-up-widget-answer', action: 'sign-in' })).toEqual({
      passed: false,
      refusal: 'unreachable',
    });
    expect(alarmed).toEqual([[botCheckAlarmLine, { kind: 'no-answer' }]]);
    expect(JSON.stringify(alarmed)).not.toMatch(/192\.0\.2|made-up-widget-answer/);
    expect(warned).toEqual([]);
  });

  it('that line reaches the logger at error level, as the app hooks it up (container.ts)', async () => {
    const lines: string[] = [];
    // The app's own threshold may be set as high as error: the line still gets through.
    const logger = createLogger({ sink: (line) => void lines.push(line), level: 'error' });
    const check = hostedBotCheck(configFor('production'), logLinesFor(logger), async () => {
      throw new TypeError('fetch failed: 192.0.2.10 https://challenges.example.test/siteverify');
    });
    await check.verify({ answer: 'made-up-widget-answer', action: 'sign-in' });
    expect(lines).toHaveLength(1);
    const written = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(written).toMatchObject({ level: 'error', msg: botCheckAlarmLine, kind: 'no-answer' });
    expect(lines[0]).not.toMatch(
      /192\.0\.2|made-up-widget-answer|siteverify|made-up-turnstile-secret-key/,
    );
  });

  it('with one key refuses to start, naming the missing one', () => {
    expect(() =>
      loadConfig({ ...env, APP_ENV: 'staging', TURNSTILE_SECRET_KEY: undefined }),
    ).toThrow(/TURNSTILE_SECRET_KEY: missing, must be set with TURNSTILE_SITE_KEY/);
  });

  it('production without both keys refuses to start, never with the check off', () => {
    for (const missing of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
      expect(() => loadConfig({ ...env, APP_ENV: 'production', [missing]: undefined })).toThrow(
        new RegExp(`${missing}: missing, must be set when APP_ENV is production`),
      );
    }
    expect(hostedBotCheck(configFor('production'), {}).widget.kind).toBe('turnstile');
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
      expect(d.realSignIn).toHaveBeenCalledWith({
        projectUrl: env.SUPABASE_URL,
        secretKey: env.SUPABASE_SECRET_KEY,
      });
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

  it('with confirmation on, goes past the check to what still stops staging (step 2.93)', async () => {
    for (const appEnv of ['staging', 'production']) {
      const d = deps([], 'on');
      const failure = await failureOf(appEnv, d);
      expect(failure.message).toMatch(/sign-in on the real service is not wired yet/);
      expect(failure.message).not.toMatch(/confirm/i);
      expect(d.realSignIn).toHaveBeenCalledOnce();
    }
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
