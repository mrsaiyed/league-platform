import { describe, expect, it, vi } from 'vitest';

vi.mock('./container.ts', () => ({ webPorts: async () => ({}) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ has: () => false }) }));

const { respond } = await import('./league-api-route.ts');

describe('respond (record 107, T-312)', () => {
  it('asks search engines not to index every league answer, refusals included', () => {
    for (const status of [200, 401, 404]) {
      const answer = respond({ status, body: { ok: status === 200 } });
      expect(answer.headers.get('x-robots-tag')).toBe('noindex');
      expect(answer.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('keeps the cache headers an answer chose, as the game snapshot does (step 2.26)', () => {
    const answer = respond({
      status: 200,
      body: {},
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=2', 'Cache-Tag': 'league:a' },
    });
    expect(answer.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=2');
    expect(answer.headers.get('cache-tag')).toBe('league:a');
    expect(answer.headers.get('x-robots-tag')).toBe('noindex');
  });
});
