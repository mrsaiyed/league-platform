// The page cache's local stand-in (step 2.26), for local work and tests: no service is
// asked. It records every label it was asked to clear, in order, so a test can say exactly
// what a finalized game cleared and what it left alone.
import type { PageCache } from './page-cache.ts';

export type LocalPageCache = PageCache & {
  /** Every label cleared so far, in the order asked. */
  readonly cleared: () => readonly string[];
};

export function createLocalPageCache(): LocalPageCache {
  const cleared: string[] = [];
  return {
    kind: 'local',
    clear: async (labels) => {
      cleared.push(...labels);
    },
    cleared: () => [...cleared],
  };
}

/**
 * No cache in front of the site to clear (T-309): a test copy or production that has not
 * been given a Cloudflare zone and key. Nothing a shared cache keeps carries a label there
 * yet (pages are drawn per request and answer `private, no-store`; the snapshot lives 2
 * seconds), so the job succeeds doing nothing.
 */
export function createPageCacheOff(): PageCache {
  return { kind: 'none', clear: async () => {} };
}
