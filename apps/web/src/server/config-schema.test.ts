import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { trackerProjectOf } from '@srleagues/providers';
import {
  ConfigError,
  fields,
  loadConfig,
  type ConfigGuard,
  type ConfigName,
} from './config-schema.ts';

const longValue = (name: string) => `value-of-${name.toLowerCase()}-0123456789-abcdefghij`;
/** A made-up authority's certificate (packages/providers' fixture), never a real one. */
const madeUpCertificate = readFileSync(
  new URL(
    '../../../../packages/providers/src/platform-database/fixtures/made-up-database-ca.certificate.txt',
    import.meta.url,
  ),
  'utf8',
);
/** A certificate's shape with nothing in it that is one. */
const notACertificate = '-----BEGIN CERTIFICATE-----\nMADEUPmadeup0123\n-----END CERTIFICATE-----';
const valid: Record<ConfigName, string> = {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  LOG_LEVEL: 'debug',
  TRUSTED_PROXY: 'one',
  PLATFORM_DATABASE_URL: 'postgres://app:hunter2-made-up@localhost:5432/x',
  PLATFORM_DATABASE_SSL: 'verify',
  PLATFORM_DATABASE_CA: madeUpCertificate,
  LOCAL_BINNED_TEAM: 'badgers',
  LOCAL_BOT_CHECK: 'stand-in',
  LOCAL_DATA: 'stand-in',
  LOCAL_DEMO_LEAGUE: 'off',
  LOCAL_SIMULATED_LEAGUE: 'off',
  LOCAL_DESIGN: 'crest-light',
  LOCAL_NOW: '2026-11-15T20:01:00Z',
  LOCAL_NO_CURRENT_SEASON: 'harbor-city',
  LOCAL_UNRELEASED: 'hidden',
  SESSION_SECRET: longValue('SESSION_SECRET'),
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: longValue('SUPABASE_SECRET_KEY'),
  TURNSTILE_SITE_KEY: '0x4AAAAAAAmadeUpSiteKey',
  TURNSTILE_SECRET_KEY: longValue('TURNSTILE_SECRET_KEY'),
  RESEND_API_KEY: longValue('RESEND_API_KEY'),
  EMAIL_FROM: 'hello@example.test',
  GOOGLE_SIGN_IN: 'on',
  CONTACT_EMAIL: 'contact@example.test',
  STRIPE_SECRET_KEY: longValue('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: longValue('STRIPE_WEBHOOK_SECRET'),
};
const names = Object.keys(fields) as ConfigName[];
/**
 * Every setting, for staging and production: LOCAL_BINNED_TEAM, LOCAL_BOT_CHECK, LOCAL_DATA,
 * LOCAL_DEMO_LEAGUE, LOCAL_DESIGN, LOCAL_NOW, LOCAL_NO_CURRENT_SEASON, LOCAL_SCORING_NAMES
 * and LOCAL_UNRELEASED are for local work and tests only.
 */
const hosted = {
  ...valid,
  LOCAL_BINNED_TEAM: undefined,
  LOCAL_BOT_CHECK: undefined,
  LOCAL_DATA: undefined,
  LOCAL_DEMO_LEAGUE: undefined,
  LOCAL_SIMULATED_LEAGUE: undefined,
  LOCAL_DESIGN: undefined,
  LOCAL_NOW: undefined,
  LOCAL_NO_CURRENT_SEASON: undefined,
  LOCAL_SCORING_NAMES: undefined,
  LOCAL_UNRELEASED: undefined,
};
/** Required in every environment. */
const required: readonly ConfigName[] = ['APP_ENV', 'PUBLIC_BASE_URL', 'EMAIL_FROM'];
/** Where something uses it (R8): only those environments require it. */
const requiredWhereUsed: Readonly<Partial<Record<ConfigName, readonly string[]>>> = {
  PLATFORM_DATABASE_URL: ['staging', 'production'],
  SUPABASE_URL: ['staging', 'production'],
  SUPABASE_SECRET_KEY: ['staging', 'production'],
  TURNSTILE_SITE_KEY: ['production'],
  TURNSTILE_SECRET_KEY: ['production'],
  RESEND_API_KEY: ['production'],
};
/** What local work needs: no database, no sign-in service, no keys. */
const localOnly = {
  APP_ENV: 'local',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  EMAIL_FROM: 'hello@example.test',
};
/** What production needs at the least. */
const production = {
  ...localOnly,
  APP_ENV: 'production',
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  TRUSTED_PROXY: 'one',
  PLATFORM_DATABASE_URL: valid.PLATFORM_DATABASE_URL,
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: valid.SUPABASE_SECRET_KEY,
  TURNSTILE_SITE_KEY: valid.TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY: valid.TURNSTILE_SECRET_KEY,
  RESEND_API_KEY: valid.RESEND_API_KEY,
};

function failure(env: Record<string, string | undefined>, guard?: ConfigGuard): ConfigError {
  try {
    loadConfig(env, guard);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('accepts a complete environment', () => {
    const config = loadConfig(valid);
    expect(config.APP_ENV).toBe('test');
    expect(config.PUBLIC_BASE_URL).toBe('http://localhost:3000');
  });

  it('defaults the optional log level', () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest['LOG_LEVEL'];
    expect(loadConfig(rest).LOG_LEVEL).toBe('info');
  });

  it('believes no forwarded address unless told (record 031)', () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest['TRUSTED_PROXY'];
    expect(loadConfig(rest).TRUSTED_PROXY).toBe('none');
    expect(failure({ ...valid, TRUSTED_PROXY: 'all' }).invalid.join()).toContain('TRUSTED_PROXY');
  });

  it('keeps the TRUSTED_PROXY default for local and test only (record 031)', () => {
    for (const appEnv of ['local', 'test']) {
      expect(
        loadConfig({ ...valid, APP_ENV: appEnv, TRUSTED_PROXY: undefined }).TRUSTED_PROXY,
      ).toBe('none');
    }
    for (const appEnv of ['staging', 'production']) {
      for (const blank of [undefined, '  ']) {
        const error = failure({ ...hosted, APP_ENV: appEnv, TRUSTED_PROXY: blank });
        expect(error.missing).toEqual([]);
        expect(error.invalid).toEqual([
          `TRUSTED_PROXY: missing, must be set explicitly when APP_ENV is ${appEnv}`,
        ]);
      }
      for (const set of ['none', 'one', 'cloudflare'] as const) {
        expect(loadConfig({ ...hosted, APP_ENV: appEnv, TRUSTED_PROXY: set }).TRUSTED_PROXY).toBe(
          set,
        );
      }
    }
  });

  it("takes Turnstile's two keys together: production needs both, staging both or neither", () => {
    const staging = { ...production, APP_ENV: 'staging', RESEND_API_KEY: undefined };
    const none = { TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined };
    // Staging with neither: starts, the bot check off (T-270).
    expect(loadConfig({ ...staging, ...none }).TURNSTILE_SITE_KEY).toBeUndefined();
    // Staging with both: starts, with Turnstile.
    expect(loadConfig(staging).TURNSTILE_SITE_KEY).toBe(valid.TURNSTILE_SITE_KEY);
    // Staging with one: refused, naming the one missing and no value.
    const onlySite = failure({ ...staging, TURNSTILE_SECRET_KEY: undefined });
    expect(onlySite.invalid).toEqual([
      'TURNSTILE_SECRET_KEY: missing, must be set with TURNSTILE_SITE_KEY (or leave out both to switch the bot check off)',
    ]);
    const onlySecret = failure({ ...staging, TURNSTILE_SITE_KEY: ' ' });
    expect(onlySecret.invalid).toEqual([
      'TURNSTILE_SITE_KEY: missing, must be set with TURNSTILE_SECRET_KEY (or leave out both to switch the bot check off)',
    ]);
    expect(onlySecret.message).not.toContain(valid.TURNSTILE_SECRET_KEY);
    // Production with neither, or one: refused.
    for (const missing of [
      none,
      { TURNSTILE_SITE_KEY: undefined },
      { TURNSTILE_SECRET_KEY: undefined },
    ]) {
      expect(failure({ ...production, ...missing }).invalid.join()).toMatch(
        /TURNSTILE_(SITE|SECRET)_KEY: missing, must be set when APP_ENV is production/,
      );
    }
  });

  it('names a missing TRUSTED_PROXY beside the other problems', () => {
    const error = failure({
      ...valid,
      APP_ENV: 'production',
      TRUSTED_PROXY: undefined,
      LOCAL_BINNED_TEAM: undefined,
      LOCAL_DATA: undefined,
      LOCAL_DESIGN: undefined,
      LOCAL_NOW: undefined,
      LOCAL_NO_CURRENT_SEASON: undefined,
      LOCAL_UNRELEASED: undefined,
      EMAIL_FROM: undefined,
    });
    expect(error.missing).toEqual(['EMAIL_FROM']);
    expect(error.invalid.join()).toContain('TRUSTED_PROXY');
  });

  it('needs no database, sign-in service or key in local work and tests (R8)', () => {
    for (const appEnv of ['local', 'test']) {
      const config = loadConfig({ ...localOnly, APP_ENV: appEnv });
      expect(config.PLATFORM_DATABASE_URL).toBeUndefined();
      expect(config.SESSION_SECRET).toBeUndefined();
      expect(config.STRIPE_SECRET_KEY).toBeUndefined();
      expect(config.LOCAL_DATA).toBe('stand-in');
    }
  });

  it('needs each setting only where something uses it (R8)', () => {
    expect(loadConfig(production).APP_ENV).toBe('production');
    const staging = { ...production, APP_ENV: 'staging', RESEND_API_KEY: undefined };
    expect(loadConfig(staging).APP_ENV).toBe('staging');
    for (const [name, environments] of Object.entries(requiredWhereUsed)) {
      for (const appEnv of environments) {
        const error = failure({ ...production, APP_ENV: appEnv, [name]: '  ' });
        expect(error.missing).toEqual([]);
        expect(error.invalid).toEqual([`${name}: missing, must be set when APP_ENV is ${appEnv}`]);
      }
    }
  });

  it('never needs the settings nothing uses yet, but still checks them when given (R8)', () => {
    const config = loadConfig(production);
    expect(config.SESSION_SECRET).toBeUndefined();
    expect(config.STRIPE_SECRET_KEY).toBeUndefined();
    expect(config.STRIPE_WEBHOOK_SECRET).toBeUndefined();
    const error = failure({ ...production, SESSION_SECRET: 'short-secret' });
    expect(error.invalid).toEqual(['SESSION_SECRET: invalid, must be at least 32 characters']);
    expect(error.message).not.toContain('short-secret');
  });

  it('takes its database only from PLATFORM_DATABASE_URL, never the tracker setting (R8)', () => {
    const tracker = 'postgres://postgres:tracker-made-up@tracker.example.test:5432/postgres';
    const error = failure({
      ...production,
      PLATFORM_DATABASE_URL: undefined,
      DATABASE_URL: tracker,
    });
    expect(error.invalid).toEqual([
      'PLATFORM_DATABASE_URL: missing, must be set when APP_ENV is production',
    ]);
    expect(error.message).not.toContain('tracker-made-up');
    expect(Object.values(loadConfig({ ...valid, DATABASE_URL: tracker }))).not.toContain(tracker);
  });

  it('reaches the database over SSL with its certificate checked unless it is on this computer (record 082)', () => {
    expect(loadConfig(production).PLATFORM_DATABASE_SSL).toBe('verify');
    const remote = 'postgres://app:hunter2-made-up@db.made-up.example.test:5432/x';
    // No SSL only for a database on this computer.
    expect(loadConfig({ ...production, PLATFORM_DATABASE_SSL: 'off' }).PLATFORM_DATABASE_SSL).toBe(
      'off',
    );
    const offRemote = failure({
      ...production,
      PLATFORM_DATABASE_URL: remote,
      PLATFORM_DATABASE_SSL: 'off',
    });
    expect(offRemote.invalid).toEqual([
      'PLATFORM_DATABASE_SSL: invalid, "off" is allowed only for a database on this computer (an address naming localhost); any other is reached over SSL with its certificate checked',
    ]);
    expect(offRemote.message).not.toContain('hunter2-made-up');
    // Never SSL without the check: the only other word is refused.
    expect(failure({ ...production, PLATFORM_DATABASE_SSL: 'no-verify' }).invalid.join()).toContain(
      'PLATFORM_DATABASE_SSL: invalid, not one of the allowed values (verify, off)',
    );
    // The certificate is a certificate, and only where SSL is on.
    const certificate = { ...production, PLATFORM_DATABASE_URL: remote };
    expect(
      loadConfig({ ...certificate, PLATFORM_DATABASE_CA: madeUpCertificate }).PLATFORM_DATABASE_CA,
    ).toBe(`${madeUpCertificate.trim()}\n`);
    const notOne = failure({ ...certificate, PLATFORM_DATABASE_CA: notACertificate });
    expect(notOne.invalid).toEqual([
      'PLATFORM_DATABASE_CA: invalid, must be the server’s certificate: its PEM text, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----, or the path of a file holding it',
    ]);
    expect(notOne.message).not.toContain('MADEUP');
    // Or the path of a file, read once by the reader config.ts hands (step 2.203).
    const read: string[] = [];
    const guard = {
      trackerProject: 'madeupprojectref0001',
      readFile: (path: string) => {
        read.push(path);
        if (path !== './made-up-ca.pem') throw new Error(`ENOENT ${path}`);
        return madeUpCertificate;
      },
    };
    expect(
      loadConfig({ ...certificate, PLATFORM_DATABASE_CA: './made-up-ca.pem' }, guard)
        .PLATFORM_DATABASE_CA,
    ).toBe(`${madeUpCertificate.trim()}\n`);
    expect(read).toEqual(['./made-up-ca.pem']);
    const unread = failure({ ...certificate, PLATFORM_DATABASE_CA: '/made-up/hidden.pem' }, guard);
    expect(unread.invalid).toEqual([
      'PLATFORM_DATABASE_CA: invalid, it names a file that cannot be read; give the path of a file this program can read, or the certificate’s own PEM text',
    ]);
    expect(unread.message).not.toContain('hidden');
    expect(
      failure({
        ...production,
        PLATFORM_DATABASE_SSL: 'off',
        PLATFORM_DATABASE_CA: madeUpCertificate,
      }).invalid,
    ).toEqual([
      'PLATFORM_DATABASE_CA: invalid, a certificate is checked only over SSL, and PLATFORM_DATABASE_SSL is "off"',
    ]);
  });

  it('refuses a public address with a path online, as the worker does (step 2.203)', () => {
    for (const appEnv of ['staging', 'production']) {
      for (const extra of ['/leagues', '/?made-up=1', '/#top']) {
        const url = `${production.PUBLIC_BASE_URL.replace(/\/$/, '')}${extra}`;
        expect(failure({ ...production, APP_ENV: appEnv, PUBLIC_BASE_URL: url }).invalid).toEqual([
          `PUBLIC_BASE_URL: invalid, must be only a scheme and host, like https://site, when APP_ENV is ${appEnv}: the site has no base path`,
        ]);
      }
    }
    expect(
      loadConfig({ ...valid, PUBLIC_BASE_URL: 'http://localhost:3000/made-up' }).PUBLIC_BASE_URL,
    ).toBe('http://localhost:3000/made-up');
  });

  it('refuses a platform address that is the tracker’s DATABASE_URL, before connecting', () => {
    const tracker = 'postgres://postgres:tracker-made-up@tracker.example.test:5432/postgres';
    for (const appEnv of ['test', 'staging', 'production']) {
      const error = failure({
        ...production,
        APP_ENV: appEnv,
        PLATFORM_DATABASE_URL: `  ${tracker} `,
        DATABASE_URL: tracker,
      });
      expect(error.invalid).toEqual([
        "PLATFORM_DATABASE_URL: invalid, must not be the tracker's database (DATABASE_URL)",
      ]);
      expect(error.message).not.toContain('tracker-made-up');
    }
    const web = 'https://made-up-project.supabase.example.test';
    expect(failure({ ...production, DATABASE_URL: web }).invalid).toEqual([
      "SUPABASE_URL: invalid, must not be the tracker's database (DATABASE_URL)",
    ]);
  });

  it('refuses a platform address that names the tracker’s Supabase project (supabase/site.json)', () => {
    const site = readFileSync(new URL('../../../../supabase/site.json', import.meta.url), 'utf8');
    const ref = trackerProjectOf(site);
    expect(ref).toMatch(/^[a-z0-9]{15,}$/);
    if (ref === null) return;
    const guard = { trackerProject: ref };
    const named = [
      `postgres://postgres:made-up-pw@db.${ref}.supabase.co:5432/postgres`,
      `postgres://postgres.${ref.toUpperCase()}:made-up-pw@pooler.example.test:6543/postgres`,
    ];
    for (const url of named) {
      const error = failure({ ...production, PLATFORM_DATABASE_URL: url }, guard);
      expect(error.invalid).toEqual([
        "PLATFORM_DATABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)",
      ]);
      expect(error.message).not.toContain('made-up-pw');
    }
    expect(
      failure({ ...production, SUPABASE_URL: `https://${ref}.supabase.co` }, guard).invalid,
    ).toEqual([
      "SUPABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)",
    ]);
    // Another project is the platform's to use.
    expect(loadConfig(production, guard).APP_ENV).toBe('production');
  });

  it('refuses the tracker’s project however the database address spells it (record 055)', () => {
    const site = readFileSync(new URL('../../../../supabase/site.json', import.meta.url), 'utf8');
    const ref = trackerProjectOf(site) ?? 'none';
    const guard = { trackerProject: ref };
    const encoded = `%${ref.charCodeAt(0).toString(16)}${ref.slice(1)}`;
    const refusal =
      "PLATFORM_DATABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)";
    for (const url of [
      `postgres://postgres.${encoded}:made-up-pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgres://made-up:made-up-pw@pooler.example.test:6543/postgres?user=postgres.${encoded}`,
      `postgres://made-up:made-up-pw@elsewhere.example.test/postgres?host=db.${ref}.supabase.co`,
    ]) {
      const error = failure({ ...production, PLATFORM_DATABASE_URL: url }, guard);
      expect(error.invalid).toEqual([refusal]);
      expect(error.message).not.toContain('made-up-pw');
      expect(error.message).not.toContain(ref);
    }
    // In staging and production: no address as the host, nor a place left to PGHOST.
    for (const appEnv of ['staging', 'production']) {
      const env = { ...production, APP_ENV: appEnv, RESEND_API_KEY: valid.RESEND_API_KEY };
      expect(
        failure({ ...env, PLATFORM_DATABASE_URL: 'postgres://a:made-up-pw@[::1]:5432/x' }, guard)
          .invalid,
      ).toEqual([
        `PLATFORM_DATABASE_URL: invalid, must name its server by a host name, not an IP address, when APP_ENV is ${appEnv}`,
      ]);
      expect(
        failure(
          { ...env, PLATFORM_DATABASE_URL: 'postgres:///postgres', PGHOST: 'db.example.test' },
          guard,
        ).invalid,
      ).toEqual([
        'PLATFORM_DATABASE_URL: invalid, must give its own host: PGHOST is set and would decide it',
      ]);
    }
  });

  it('refuses staging and production when the tracker’s project could not be read', () => {
    const guard = { trackerProject: null };
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv }, guard).invalid).toEqual([
        "supabase/site.json: could not be read, so PLATFORM_DATABASE_URL and SUPABASE_URL cannot be checked against the tracker's project",
      ]);
    }
    expect(loadConfig(localOnly, guard).APP_ENV).toBe('local');
  });

  it('takes LOCAL_DATA in local work and tests only (record 055)', () => {
    expect(loadConfig({ ...localOnly, LOCAL_DATA: 'made-up-database' }).LOCAL_DATA).toBe(
      'made-up-database',
    );
    expect(failure({ ...localOnly, LOCAL_DATA: 'everything' }).invalid.join()).toContain(
      'LOCAL_DATA',
    );
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, LOCAL_DATA: 'stand-in' }).invalid).toEqual([
        'LOCAL_DATA: invalid, may be set only when APP_ENV is local or test',
      ]);
    }
  });

  it('takes LOCAL_DEMO_LEAGUE in local work and tests only, with the made-up database (step 2.59)', () => {
    expect(loadConfig(localOnly).LOCAL_DEMO_LEAGUE).toBe('off');
    expect(
      loadConfig({ ...localOnly, LOCAL_DATA: 'made-up-database', LOCAL_DEMO_LEAGUE: 'on' })
        .LOCAL_DEMO_LEAGUE,
    ).toBe('on');
    expect(failure({ ...localOnly, LOCAL_DEMO_LEAGUE: 'on' }).invalid).toEqual([
      'LOCAL_DEMO_LEAGUE: invalid, the demo-shaped league is loaded into the made-up database only, so it may be on only with LOCAL_DATA=made-up-database',
    ]);
    expect(
      failure({
        ...localOnly,
        LOCAL_DATA: 'made-up-database',
        LOCAL_DEMO_LEAGUE: 'yes',
      }).invalid.join(),
    ).toContain('LOCAL_DEMO_LEAGUE');
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, LOCAL_DEMO_LEAGUE: 'off' }).invalid).toEqual(
        ['LOCAL_DEMO_LEAGUE: invalid, may be set only when APP_ENV is local or test'],
      );
    }
  });

  it('takes LOCAL_SIMULATED_LEAGUE in local work and tests only, with the made-up database (step 2.236)', () => {
    const onDatabase = { ...localOnly, LOCAL_DATA: 'made-up-database' };
    expect(loadConfig(onDatabase).LOCAL_SIMULATED_LEAGUE).toBeUndefined();
    const size = '--teams 24 --divisions 4 --rounds 10 --tracked 6 --seed 7';
    expect(loadConfig({ ...localOnly, LOCAL_SIMULATED_LEAGUE: 'off' }).LOCAL_SIMULATED_LEAGUE).toBe(
      'off',
    );
    for (const value of ['on', size, '--teams 12', `  ${size} `]) {
      expect(
        loadConfig({ ...onDatabase, APP_ENV: 'test', LOCAL_SIMULATED_LEAGUE: value })
          .LOCAL_SIMULATED_LEAGUE,
      ).toBe(value.trim());
    }
    // With the demo-shaped league too: both leagues are made.
    expect(
      loadConfig({ ...onDatabase, LOCAL_DEMO_LEAGUE: 'on', LOCAL_SIMULATED_LEAGUE: 'on' }),
    ).toMatchObject({ LOCAL_DEMO_LEAGUE: 'on', LOCAL_SIMULATED_LEAGUE: 'on' });
    // A value that cannot be read: one sentence, with a right example.
    for (const value of ['yes', '24 teams', '--teams', '--players 5', '--teams twelve']) {
      expect(failure({ ...onDatabase, LOCAL_SIMULATED_LEAGUE: value }).invalid).toEqual([
        'LOCAL_SIMULATED_LEAGUE: invalid, must be on, or the size in the simulate command\'s words, for example LOCAL_SIMULATED_LEAGUE="--teams 24 --divisions 4 --rounds 10 --tracked 6 --seed 7"',
      ]);
    }
    expect(failure({ ...localOnly, LOCAL_SIMULATED_LEAGUE: 'on' }).invalid).toEqual([
      'LOCAL_SIMULATED_LEAGUE: invalid, the simulated league is played into the made-up database only, so it may be set only with LOCAL_DATA=made-up-database',
    ]);
    for (const appEnv of ['staging', 'production']) {
      expect(
        failure({ ...production, APP_ENV: appEnv, LOCAL_SIMULATED_LEAGUE: 'on' }).invalid,
      ).toEqual(['LOCAL_SIMULATED_LEAGUE: invalid, may be set only when APP_ENV is local or test']);
    }
  });

  it('takes LOCAL_DESIGN in local work and tests only, and only a design it knows (step 2.147)', () => {
    expect(loadConfig(localOnly).LOCAL_DESIGN).toBeUndefined();
    for (const name of ['crest', 'crest-light', 'midnight-gold', 'clean-court', 'pine']) {
      expect(loadConfig({ ...localOnly, LOCAL_DESIGN: name }).LOCAL_DESIGN).toBe(name);
      expect(loadConfig({ ...localOnly, APP_ENV: 'test', LOCAL_DESIGN: name }).LOCAL_DESIGN).toBe(
        name,
      );
    }
    const design = failure({ ...localOnly, LOCAL_DESIGN: 'no-such-design' }).invalid;
    expect(design).toHaveLength(1);
    // The allowed values are named (step 2.203, L1); the value given is not.
    expect(design[0]).toMatch(/^LOCAL_DESIGN: invalid, not one of the allowed values \(.+\)$/);
    expect(design[0]).toContain('crest');
    expect(design[0]).not.toContain('no-such-design');
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, LOCAL_DESIGN: 'crest' }).invalid).toEqual([
        'LOCAL_DESIGN: invalid, may be set only when APP_ENV is local or test',
      ]);
    }
  });

  it('takes LOCAL_BINNED_TEAM in local work and tests only, and only a short name (step 2.180)', () => {
    expect(loadConfig(localOnly).LOCAL_BINNED_TEAM).toBeUndefined();
    expect(loadConfig({ ...localOnly, LOCAL_BINNED_TEAM: 'badgers' }).LOCAL_BINNED_TEAM).toBe(
      'badgers',
    );
    expect(failure({ ...localOnly, LOCAL_BINNED_TEAM: 'Bad Gers' }).invalid.join()).toContain(
      'LOCAL_BINNED_TEAM',
    );
    for (const appEnv of ['staging', 'production']) {
      expect(
        failure({ ...production, APP_ENV: appEnv, LOCAL_BINNED_TEAM: 'badgers' }).invalid,
      ).toEqual(['LOCAL_BINNED_TEAM: invalid, may be set only when APP_ENV is local or test']);
    }
  });

  it('takes LOCAL_NO_CURRENT_SEASON in local work and tests only, and only a short name (step 2.130)', () => {
    const name = 'LOCAL_NO_CURRENT_SEASON';
    expect(loadConfig(localOnly)[name]).toBeUndefined();
    expect(loadConfig({ ...localOnly, [name]: 'harbor-city' })[name]).toBe('harbor-city');
    expect(failure({ ...localOnly, [name]: 'Harbor City' }).invalid.join()).toContain(name);
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, [name]: 'harbor-city' }).invalid).toEqual([
        `${name}: invalid, may be set only when APP_ENV is local or test`,
      ]);
    }
  });

  it('takes LOCAL_SCORING_NAMES in local work and tests only, and only a short name (step 2.226)', () => {
    const name = 'LOCAL_SCORING_NAMES';
    expect(loadConfig(localOnly)[name]).toBeUndefined();
    expect(loadConfig({ ...localOnly, [name]: 'north-valley' })[name]).toBe('north-valley');
    expect(failure({ ...localOnly, [name]: 'North Valley' }).invalid.join()).toContain(name);
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, [name]: 'north-valley' }).invalid).toEqual([
        `${name}: invalid, may be set only when APP_ENV is local or test`,
      ]);
    }
  });

  it('takes LOCAL_NOW in local work and tests only, and only a UTC time (step 2.179)', () => {
    expect(loadConfig(localOnly).LOCAL_NOW).toBeUndefined();
    const at = '2026-11-15T06:10:00Z';
    expect(loadConfig({ ...localOnly, LOCAL_NOW: at }).LOCAL_NOW).toBe(at);
    expect(loadConfig({ ...localOnly, APP_ENV: 'test', LOCAL_NOW: at }).LOCAL_NOW).toBe(at);
    expect(failure({ ...localOnly, LOCAL_NOW: 'tomorrow' }).invalid.join()).toContain('LOCAL_NOW');
    for (const appEnv of ['staging', 'production']) {
      expect(failure({ ...production, APP_ENV: appEnv, LOCAL_NOW: at }).invalid).toEqual([
        'LOCAL_NOW: invalid, may be set only when APP_ENV is local or test',
      ]);
    }
  });

  it('takes LOCAL_UNRELEASED in local work and tests only, shown by default (step 2.140)', () => {
    expect(loadConfig(localOnly).LOCAL_UNRELEASED).toBe('shown');
    for (const appEnv of ['local', 'test']) {
      for (const set of ['shown', 'hidden'] as const) {
        expect(
          loadConfig({ ...localOnly, APP_ENV: appEnv, LOCAL_UNRELEASED: set }).LOCAL_UNRELEASED,
        ).toBe(set);
      }
    }
    expect(failure({ ...localOnly, LOCAL_UNRELEASED: 'everything' }).invalid).toEqual([
      'LOCAL_UNRELEASED: invalid, not one of the allowed values (shown, hidden)',
    ]);
    for (const appEnv of ['staging', 'production']) {
      for (const set of ['shown', 'hidden']) {
        expect(failure({ ...production, APP_ENV: appEnv, LOCAL_UNRELEASED: set }).invalid).toEqual([
          'LOCAL_UNRELEASED: invalid, may be set only when APP_ENV is local or test',
        ]);
      }
    }
  });

  it('refuses LOCAL_NOW with the made-up database, which keeps this computer’s clock', () => {
    const at = '2026-11-15T06:10:00Z';
    for (const appEnv of ['local', 'test']) {
      expect(
        failure({ ...localOnly, APP_ENV: appEnv, LOCAL_DATA: 'made-up-database', LOCAL_NOW: at })
          .invalid,
      ).toEqual([
        'LOCAL_NOW: invalid, the made-up database keeps this computer’s clock, so it may not be set with LOCAL_DATA=made-up-database',
      ]);
    }
    expect(loadConfig({ ...localOnly, LOCAL_DATA: 'stand-in', LOCAL_NOW: at }).LOCAL_NOW).toBe(at);
  });

  it('ignores variables it does not know', () => {
    expect(loadConfig({ ...valid, PATH: '/bin' }).APP_ENV).toBe('test');
  });

  for (const name of required) {
    it(`names ${name} when it is missing or blank`, () => {
      expect(failure({ ...valid, [name]: undefined }).message).toContain(`${name}: missing`);
      expect(failure({ ...valid, [name]: '   ' }).missing).toEqual([name]);
    });
  }

  it('lists every missing variable in one error', () => {
    const error = failure({});
    expect([...error.missing].sort()).toEqual([...required].sort());
    for (const name of required) expect(error.message).toContain(name);
  });

  it('names invalid values without printing them', () => {
    const error = failure({
      ...valid,
      APP_ENV: 'nonsense-env',
      PUBLIC_BASE_URL: 'not a url',
      PLATFORM_DATABASE_URL: 'mysql://user:topsecretpw@host/db',
      SESSION_SECRET: 'short-secret',
    });
    expect(error.invalid.map((line) => line.split(':')[0]).sort()).toEqual([
      'APP_ENV',
      'PLATFORM_DATABASE_URL',
      'PUBLIC_BASE_URL',
      'SESSION_SECRET',
    ]);
    for (const value of ['nonsense-env', 'not a url', 'topsecretpw', 'short-secret']) {
      expect(error.message).not.toContain(value);
    }
  });

  it('never prints secret values that were given', () => {
    const error = failure({ ...valid, APP_ENV: undefined, SESSION_SECRET: 'tiny' });
    for (const name of names.filter((n) => fields[n].secret)) {
      expect(error.message).not.toContain(valid[name]);
    }
    expect(error.message).not.toContain('hunter2-made-up');
    expect(error.message).not.toContain('tiny');
  });
});

describe('.env.example', () => {
  it('names exactly the schema fields in its web app part, and its active lines load', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const webPart = text.slice(text.indexOf('# --- Web app'), text.indexOf('# --- Worker'));
    const named = new Set<string>();
    const env: Record<string, string> = {};
    for (const line of webPart.split(/\r?\n/)) {
      const m = /^(# ?)?([A-Z_]+)=(.*)$/.exec(line);
      if (m?.[2] === undefined) continue;
      named.add(m[2]);
      if (m[1] === undefined) env[m[2]] = m[3] ?? '';
    }
    expect([...named].sort()).toEqual([...names].sort());
    // What local work needs, and nothing else: no database address, key or secret.
    expect(Object.keys(env).sort()).toEqual(
      ['APP_ENV', 'EMAIL_FROM', 'LOG_LEVEL', 'PUBLIC_BASE_URL', 'TRUSTED_PROXY'].sort(),
    );
    expect(() => loadConfig(env)).not.toThrow();
    // The tracker's setting is never one of the web app's (R8).
    expect(named.has('DATABASE_URL')).toBe(false);
  });
});

describe('web addresses', () => {
  it('accept only http or https', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://example.test']) {
      expect(failure({ ...valid, PUBLIC_BASE_URL: bad }).invalid.join()).toContain(
        'PUBLIC_BASE_URL',
      );
    }
  });
  it('online, refuse an http public address in one plain sentence, so the cookie stays secure (audit P9)', () => {
    for (const appEnv of ['staging', 'production']) {
      const online = { ...production, APP_ENV: appEnv };
      for (const http of ['http://leagues.example.test', 'HTTP://leagues.example.test/']) {
        const error = failure({ ...online, PUBLIC_BASE_URL: http });
        expect(error.missing).toEqual([]);
        expect(error.invalid).toEqual([
          `PUBLIC_BASE_URL: invalid, must start with https:// when APP_ENV is ${appEnv}, or the sign-in cookie could be read on the way; set it to the site’s https address (http is allowed only for localhost)`,
        ]);
      }
      // https is accepted, and so is http on this computer, where no network lies between.
      expect(loadConfig(online).PUBLIC_BASE_URL).toBe('https://leagues.example.test');
      for (const here of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
        expect(loadConfig({ ...online, PUBLIC_BASE_URL: here }).PUBLIC_BASE_URL).toBe(here);
      }
      // A name that only starts like this computer's is not this computer.
      expect(
        failure({ ...online, PUBLIC_BASE_URL: 'http://localhost.example.test' }).invalid.join(),
      ).toContain('must start with https://');
    }
    // Locally and in tests an http address stays as it was.
    for (const appEnv of ['local', 'test']) {
      const address = 'http://leagues.example.test';
      expect(
        loadConfig({ ...valid, APP_ENV: appEnv, PUBLIC_BASE_URL: address }).PUBLIC_BASE_URL,
      ).toBe(address);
    }
  });
  it('reports a bad optional value as invalid, not missing', () => {
    const error = failure({ ...valid, LOG_LEVEL: 'loud' });
    expect(error.missing).toEqual([]);
    expect(error.invalid.join()).toContain('LOG_LEVEL');
  });
});

describe('CONTACT_EMAIL (step 2.135)', () => {
  it('is optional everywhere, and checked as an email address when given', () => {
    expect(loadConfig(localOnly).CONTACT_EMAIL).toBeUndefined();
    expect(loadConfig(production).CONTACT_EMAIL).toBeUndefined();
    expect(loadConfig({ ...production, CONTACT_EMAIL: 'contact@example.test' }).CONTACT_EMAIL).toBe(
      'contact@example.test',
    );
    expect(failure({ ...valid, CONTACT_EMAIL: 'not an address' }).invalid.join()).toContain(
      'CONTACT_EMAIL',
    );
  });
});
