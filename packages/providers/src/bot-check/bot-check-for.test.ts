// Which bot check an environment gets (record 081): never Turnstile in local work or tests;
// in staging, Turnstile with both keys and the check off with neither (T-270); production
// always needs both.
import { describe, expect, it } from 'vitest';
import { BotCheckSettingsError, botCheckFor } from './bot-check-for.ts';

const keys = { turnstileSiteKey: 'made-up-site-key', turnstileSecretKey: 'made-up-secret' };
const input = { answer: '', action: 'sign-up', networkAddress: '192.0.2.10' } as const;

describe('botCheckFor', () => {
  it('gives local work and tests the stand-in, whatever keys they are given', () => {
    for (const appEnv of ['local', 'test'] as const) {
      const check = botCheckFor({ appEnv, siteHostname: 'localhost', ...keys });
      expect(check.widget.kind).toBe('stand-in');
    }
  });

  it('gives staging and production Turnstile with both keys', () => {
    for (const appEnv of ['staging', 'production'] as const) {
      const check = botCheckFor({ appEnv, siteHostname: 'leagues.example.test', ...keys });
      expect(check.widget).toMatchObject({ kind: 'turnstile', siteKey: 'made-up-site-key' });
    }
  });

  it('switches the check off in staging with neither key: nothing drawn, every form passes', async () => {
    for (const none of [{}, { turnstileSiteKey: ' ', turnstileSecretKey: '' }]) {
      const check = botCheckFor({
        appEnv: 'staging',
        siteHostname: 'staging.example.test',
        ...none,
      });
      expect(check.widget.kind).toBe('off');
      expect(await check.verify(input)).toEqual({ passed: true });
    }
  });

  it('refuses staging with only one of the two keys, naming the missing one and no value', () => {
    expect(() =>
      botCheckFor({
        appEnv: 'staging',
        siteHostname: 'x.test',
        turnstileSiteKey: 'made-up-site-key',
      }),
    ).toThrow(/TURNSTILE_SECRET_KEY is missing/);
    const onlySecret = () =>
      botCheckFor({
        appEnv: 'staging',
        siteHostname: 'x.test',
        turnstileSecretKey: 'made-up-secret',
      });
    expect(onlySecret).toThrow(/TURNSTILE_SITE_KEY is missing/);
    expect(onlySecret).toThrow(BotCheckSettingsError);
    try {
      onlySecret();
    } catch (error) {
      expect(String(error)).not.toContain('made-up-secret');
    }
  });

  it('refuses production without both keys, never switching the check off', () => {
    for (const missing of [{}, { turnstileSiteKey: 'k' }, { turnstileSecretKey: ' ' }]) {
      expect(() =>
        botCheckFor({ appEnv: 'production', siteHostname: 'leagues.example.test', ...missing }),
      ).toThrow('botCheckFor: production needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.');
    }
  });
});
