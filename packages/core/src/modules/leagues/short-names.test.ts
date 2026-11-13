import { describe, expect, it } from 'vitest';
import { blockedShortNames } from './blocked-short-names.ts';
import { isBlockedShortName, shortNameSchema } from './short-names.ts';

describe('short names (U-7)', () => {
  it('accepts 3 to 40 lowercase letters, numbers and hyphens', () => {
    for (const good of ['abc', 'north-league', 'a1-2', 'x'.repeat(40)]) {
      expect(shortNameSchema.safeParse(good).success).toBe(true);
    }
    const bad = ['ab', 'x'.repeat(41), 'North', 'north league', 'north_league', 'é-league', ''];
    for (const name of bad) expect(shortNameSchema.safeParse(name).success).toBe(false);
  });

  it('blocks our own words, whatever their capitals, and every listed word is itself valid', () => {
    for (const word of ['account', 'admin', 'api', 'find', 'help', 'pricing', 'signin', 'start']) {
      expect(isBlockedShortName(word)).toBe(true);
    }
    expect(isBlockedShortName('Terms')).toBe(true);
    expect(isBlockedShortName('north-league')).toBe(false);
    for (const word of blockedShortNames) {
      expect(shortNameSchema.safeParse(word).success).toBe(true);
    }
  });
});
