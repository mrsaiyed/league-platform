// The worker's one read of the environment (T-30) runs the tracker's database guard
// against the repository's own supabase/site.json (record 055), before anything
// connects. Every value here is made up.
import { trackerProjectOf } from '@srleagues/providers';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getWorkerConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses a database address naming the project in supabase/site.json', async () => {
    const site = readFileSync(new URL('../../../supabase/site.json', import.meta.url), 'utf8');
    const ref = trackerProjectOf(site);
    expect(ref).not.toBeNull();
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('PUBLIC_BASE_URL', 'https://staging.example.test');
    vi.stubEnv('EMAIL_FROM', 'hello@example.test');
    vi.stubEnv(
      'PLATFORM_DATABASE_URL',
      `postgres://postgres.${ref ?? 'none'}:made-up-pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    );
    const { getWorkerConfig } = await import('./config.ts');
    expect(() => getWorkerConfig()).toThrow(
      /PLATFORM_DATABASE_URL: invalid, must not name the tracker's Supabase project/,
    );
    try {
      getWorkerConfig();
    } catch (error) {
      expect(String(error)).not.toContain('made-up-pw');
      expect(String(error)).not.toContain(ref ?? 'none');
    }
  });
});
