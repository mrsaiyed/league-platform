// Which bot check an environment gets (record 081): never Turnstile in local work or tests.
import { describe, expect, it } from 'vitest';
import { botCheckFor } from './bot-check-for.ts';

const keys = { turnstileSiteKey: 'made-up-site-key', turnstileSecretKey: 'made-up-secret' };

describe('botCheckFor', () => {
  it('gives local work and tests the stand-in, whatever keys they are given', () => {
    for (const appEnv of ['local', 'test'] as const) {
      const check = botCheckFor({ appEnv, siteHostname: 'localhost', ...keys });
      expect(check.widget.kind).toBe('stand-in');
    }
  });

  it('gives staging and production Turnstile with its keys', () => {
    for (const appEnv of ['staging', 'production'] as const) {
      const check = botCheckFor({ appEnv, siteHostname: 'leagues.example.test', ...keys });
      expect(check.widget).toMatchObject({ kind: 'turnstile', siteKey: 'made-up-site-key' });
    }
  });

  it('refuses staging and production without both keys, naming no value', () => {
    for (const missing of [{}, { turnstileSiteKey: 'k' }, { turnstileSecretKey: ' ' }]) {
      expect(() =>
        botCheckFor({ appEnv: 'production', siteHostname: 'leagues.example.test', ...missing }),
      ).toThrow('botCheckFor: production needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.');
    }
  });
});
