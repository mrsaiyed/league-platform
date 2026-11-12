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
