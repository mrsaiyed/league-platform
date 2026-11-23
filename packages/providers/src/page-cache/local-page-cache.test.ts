import { describe, expect, it } from 'vitest';
import { createLocalPageCache, createPageCacheOff } from './local-page-cache.ts';

describe('the local page cache', () => {
  it('records every label it clears, in order', async () => {
    const cache = createLocalPageCache();
    await cache.clear(['league:a:game:1']);
    await cache.clear(['league:a:season:2:standings', 'league:a:game:1']);
    expect(cache.kind).toBe('local');
    expect(cache.cleared()).toEqual([
      'league:a:game:1',
      'league:a:season:2:standings',
      'league:a:game:1',
    ]);
  });

  it('with no cache in front of the site, clearing does nothing and succeeds', async () => {
    const cache = createPageCacheOff();
    expect(cache.kind).toBe('none');
    await expect(cache.clear(['league:a:game:1'])).resolves.toBeUndefined();
  });
});
