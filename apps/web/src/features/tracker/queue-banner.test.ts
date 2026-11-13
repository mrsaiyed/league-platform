import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import { savedBanner, savedBannerText } from './queue-banner.ts';

const t = createTranslator('en');
const refused = { command: tap(1), refusal: { code: 'rule', message: '' } } as const;
const text = (waiting: number, refusedCount: number) =>
  savedBannerText(
    savedBanner({ waiting, refused: Array.from({ length: refusedCount }, () => refused) }),
    t,
  );

describe('saved banner (T6 §4)', () => {
  it('says all saved only when nothing waits and nothing was refused', () => {
    expect(text(0, 0)).toBe('All saved');
  });

  it('counts the taps waiting to send', () => {
    expect(text(1, 0)).toBe('1 action waiting to send');
    expect(text(12, 3)).toBe('12 actions waiting to send');
  });

  it('counts refused taps as not saved once none wait', () => {
    expect(text(0, 1)).toBe('1 action not saved');
    expect(text(0, 2)).toBe('2 actions not saved');
  });
});
