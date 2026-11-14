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
    const { trackerProjectOf } = await import('./config-schema.ts');
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
