import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import { savedBanner, savedBannerShortLines, savedBannerText } from './queue-banner.ts';

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

  it('says the same shorter, a line for each thing, for a phone short of room', () => {
    const short = (waiting: number, refusedCount: number, storageFailed = false) =>
      savedBannerShortLines(
        savedBanner({
          waiting,
          refused: Array.from({ length: refusedCount }, () => refused),
          storageFailure: storageFailed ? { code: 'storage-write-failed', since: 0 } : null,
        }),
        t,
      );
    expect(short(0, 0)).toEqual(['All saved']);
    expect(short(1, 0)).toEqual(['1 to send']);
    expect(short(12, 3)).toEqual(['12 to send', '3 not saved']);
    // Never fewer lines than the long form, and the storage's failure first there too.
    expect(short(2, 1, true)).toEqual(['Storage failed', '2 to send', '1 not saved']);
    expect(short(0, 0, true)).toEqual(['Storage failed']);
  });
});
