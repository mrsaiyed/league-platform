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
