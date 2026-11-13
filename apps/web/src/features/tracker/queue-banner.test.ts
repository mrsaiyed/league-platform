import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import { savedBanner, savedBannerText } from './queue-banner.ts';

const t = createTranslator('en');
const refused = { command: tap(1), refusal: { code: 'rule', message: '' } } as const;
const text = (waiting: number, refusedCount: number, storageFailed = false) =>
  savedBannerText(
    savedBanner({
      waiting,
      refused: Array.from({ length: refusedCount }, () => refused),
      storageFailure: storageFailed ? { code: 'storage-write-failed', since: 0 } : null,
    }),
    t,
  );

describe('saved banner (T6 §4)', () => {
  it('says all saved only when nothing waits, nothing was refused and the storage works', () => {
    expect(text(0, 0)).toBe('All saved');
  });

  it('counts the taps waiting to send', () => {
    expect(text(1, 0)).toBe('1 action waiting to send');
    expect(text(12, 0)).toBe('12 actions waiting to send');
  });

  it('counts refused taps as not saved', () => {
    expect(text(0, 1)).toBe('1 action not saved');
    expect(text(0, 2)).toBe('2 actions not saved');
  });

  it('shows both counts when taps wait and others were refused', () => {
    expect(text(12, 3)).toBe('12 actions waiting to send · 3 actions not saved');
  });

  it('says the storage failed, never that the device is offline (record 024)', () => {
    expect(text(0, 0, true)).toBe('This device could not save to its storage');
    expect(text(2, 1, true)).toBe(
      'This device could not save to its storage · 2 actions waiting to send · 1 action not saved',
    );
  });
});
