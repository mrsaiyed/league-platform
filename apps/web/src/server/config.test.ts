import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses a bad environment and never prints values', async () => {
    vi.stubEnv('APP_ENV', 'nonsense-marker-9f3');
    const { getConfig } = await import('./config.ts');
    expect(() => getConfig()).toThrow(/APP_ENV/);
    try {
      getConfig();
    } catch (error) {
      expect(String(error)).not.toContain('nonsense-marker-9f3');
    }
  });
});

describe('getConfig and the tracker’s project', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses a Supabase address naming the project in supabase/site.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { trackerProjectOf } = await import('@srleagues/providers');
    const site = readFileSync(new URL('../../../../supabase/site.json', import.meta.url), 'utf8');
    const ref = trackerProjectOf(site);
    expect(ref).not.toBeNull();
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('PUBLIC_BASE_URL', 'http://localhost:3000');
    vi.stubEnv('EMAIL_FROM', 'hello@example.test');
    vi.stubEnv('SUPABASE_URL', `https://${ref ?? 'none'}.supabase.co`);
    const { getConfig } = await import('./config.ts');
    expect(() => getConfig()).toThrow(/SUPABASE_URL: invalid, must not name the tracker/);
  });

  it('finds site.json from its own file, never the working folder (record 055)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { trackerProjectOf } = await import('@srleagues/providers');
    const site = readFileSync(new URL('../../../../supabase/site.json', import.meta.url), 'utf8');
    const ref = trackerProjectOf(site) ?? 'none';
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('PUBLIC_BASE_URL', 'https://staging.example.test');
    vi.stubEnv('EMAIL_FROM', 'hello@example.test');
    vi.stubEnv('TRUSTED_PROXY', 'one');
    vi.stubEnv('SUPABASE_URL', 'https://made-up.supabase.example.test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'made-up-supabase-secret-key');
    vi.stubEnv('TURNSTILE_SITE_KEY', 'made-up-turnstile-site-key');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'made-up-turnstile-secret-key');
    vi.stubEnv('PLATFORM_DATABASE_URL', `postgres://made-up:made-up-pw@db.${ref}.supabase.co/x`);
    // A made-up folder whose own supabase/site.json names another project.
    const decoy = new URL(
      '../../../../packages/providers/src/platform-database/fixtures/repo/apps/web/',
      import.meta.url,
    );
    const startedIn = process.cwd();
    process.chdir(fileURLToPath(decoy));
    try {
      const { getConfig } = await import('./config.ts');
      expect(() => getConfig()).toThrow(
        /PLATFORM_DATABASE_URL: invalid, must not name the tracker/,
      );
    } finally {
      process.chdir(startedIn);
    }
  });
});

describe('isBuildPhase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is true only while Next.js builds, so the build never starts the app', async () => {
    const { isBuildPhase } = await import('./config.ts');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    expect(isBuildPhase()).toBe(true);
    vi.stubEnv('NEXT_PHASE', 'phase-production-server');
    expect(isBuildPhase()).toBe(false);
    vi.stubEnv('NEXT_PHASE', '');
    expect(isBuildPhase()).toBe(false);
  });
});
