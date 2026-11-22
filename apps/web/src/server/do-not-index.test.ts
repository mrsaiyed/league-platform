// "Do not index" outside production (record 082), as the server's own functions give it:
// the proxy's header on every answer it passes on and on its own plain page, the root
// layout's mark, and /robots.txt. Over the network, for a page, an API answer and an error
// page, it is checked by tests/browser/test-copy-test.mjs.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings: { APP_ENV: string | Error } = { APP_ENV: 'staging' };
vi.mock('./config.ts', () => ({
  getConfig: () => {
    if (settings.APP_ENV instanceof Error) throw settings.APP_ENV;
    return { APP_ENV: settings.APP_ENV, PUBLIC_BASE_URL: 'https://leagues.example.test' };
  },
  isBuildPhase: () => false,
  isDevelopmentServer: () => false,
}));
const webPorts = vi.fn();
// The proxy reads the started bot check's widget for the page's script policy; no check here.
const botCheck = { widget: { kind: 'off', field: 'cf-turnstile-response' } } as const;
vi.mock('./container.ts', () => ({ webPorts }));

const { doNotIndex, marksDoNotIndex, keepOutRobots } = await import('./do-not-index.ts');
const { proxy } = await import('../proxy.ts');
const { generateMetadata } = await import('../app/layout.tsx');
const { GET: robots } = await import('../app/robots.txt/route.ts');

beforeEach(() => {
  webPorts.mockReset();
  webPorts.mockResolvedValue({ answers: () => true, botCheck });
});

describe('do not index', () => {
  it('marks every copy but production', () => {
    expect(['local', 'test', 'staging', undefined, 'anything'].map(marksDoNotIndex)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(marksDoNotIndex('production')).toBe(false);
  });

  it('fails closed: settings that cannot be read are not production’s', () => {
    settings.APP_ENV = new Error('a setting is missing');
    expect(doNotIndex()).toBe(true);
    settings.APP_ENV = 'staging';
  });

  for (const appEnv of ['test', 'staging', 'production']) {
    const marked = appEnv !== 'production';
    it(`${appEnv}: the proxy's header, the page's own mark and robots.txt`, async () => {
      settings.APP_ENV = appEnv;
      const passedOn = await proxy(new NextRequest('https://leagues.example.test/lakeside'));
      expect(passedOn.headers.get('x-robots-tag')).toBe(marked ? 'noindex' : null);
      const api = await proxy(new NextRequest('https://leagues.example.test/api/v1/health'));
      expect(api.headers.get('x-robots-tag')).toBe(marked ? 'noindex' : null);
      // The proxy's own plain page, for a request it does not answer, carries it too.
      webPorts.mockResolvedValue({ answers: () => false, botCheck });
      const refused = await proxy(new NextRequest('https://leagues.example.test/lakeside'));
      expect(refused.status).toBe(421);
      expect(refused.headers.get('x-robots-tag')).toBe(marked ? 'noindex' : null);
      // And when the app could not start: still marked.
      webPorts.mockRejectedValue(new Error('cannot start'));
      const down = await proxy(new NextRequest('https://leagues.example.test/lakeside'));
      expect(down.headers.get('x-robots-tag')).toBe(marked ? 'noindex' : null);

      expect(generateMetadata().robots).toEqual(
        marked ? { index: false, follow: false } : undefined,
      );

      const rule = robots();
      if (marked) {
        expect(rule.status).toBe(200);
        expect(rule.headers.get('content-type')).toBe('text/plain; charset=utf-8');
        expect(await rule.text()).toBe(keepOutRobots);
      } else {
        expect(rule.status).toBe(404);
        expect(await rule.text()).toBe('');
      }
      settings.APP_ENV = 'staging';
    });
  }
});
