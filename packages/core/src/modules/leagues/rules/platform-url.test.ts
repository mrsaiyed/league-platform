import { describe, expect, it } from 'vitest';
import { isSystemShortName } from '../short-names.ts';
import { platformPages, platformUrl, type PlatformPage } from './platform-url.ts';

describe('platformUrl (T-34)', () => {
  it('builds our own pages’ addresses', () => {
    expect(platformUrl('home')).toBe('/');
    expect(platformUrl('signin')).toBe('/signin');
    expect(platformUrl('inbox')).toBe('/account/inbox');
  });

  it('starts every page with one of our own words, which no league may take', () => {
    for (const page of Object.keys(platformPages) as PlatformPage[]) {
      const first = platformPages[page][0];
      if (first !== undefined) expect(isSystemShortName(first)).toBe(true);
    }
  });
});
