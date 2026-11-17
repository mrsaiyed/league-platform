// Every browser gets its page's title in the head, never streamed after the page (T-275,
// record 071, step 2.175). Read through Next.js's own rule for it: the same function its
// server asks, with the setting as its server holds it (it keeps a RegExp's source text).
// Removing or narrowing the setting fails here, whatever the timing of any page.
import { shouldServeStreamingMetadata } from 'next/dist/server/lib/streaming-metadata.js';
import { describe, expect, it } from 'vitest';
import config from './next.config.ts';

const browsers = {
  Chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Safari on an iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  Firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
  Edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
};

describe('page titles are never streamed (T-275)', () => {
  it('names every browser as one that gets its metadata in the head', () => {
    expect(config.htmlLimitedBots).toBeInstanceOf(RegExp);
    for (const [browser, userAgent] of Object.entries(browsers)) {
      expect(
        shouldServeStreamingMetadata(userAgent, config.htmlLimitedBots?.source),
        `${browser} would get its title late`,
      ).toBe(false);
    }
  });
});

describe('the files the proxy never sees are marked "do not index" (record 081)', () => {
  it('in every mode, as they are files and never pages', async () => {
    const rules = (await config.headers?.()) ?? [];
    const marked = rules
      .filter((rule) =>
        rule.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex'),
      )
      .map((rule) => rule.source);
    expect(marked).toEqual([
      '/_next/static/:path*',
      '/_next/image',
      '/favicon.ico',
      '/display.css',
      '/standalone.css',
    ]);
  });
});
