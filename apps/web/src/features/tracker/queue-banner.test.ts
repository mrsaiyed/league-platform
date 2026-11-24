import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import { savedBanner, savedBannerShortLines, savedBannerText } from './queue-banner.ts';

const t = createTranslator('en');
const refused = { command: tap(1), refusal: { code: 'rule', message: '' } } as const;
const status = (waiting: number, refusedCount: number, storageFailed = false) => ({
  waiting,
  refused: Array.from({ length: refusedCount }, () => refused),
  storageFailure: storageFailed ? ({ code: 'storage-write-failed', since: 0 } as const) : null,
});
const text = (waiting: number, refusedCount: number, storageFailed = false) =>
  savedBannerText(savedBanner(status(waiting, refusedCount, storageFailed)), t);

describe('saved banner (T6 §4)', () => {
  it('says all saved only when nothing waits, nothing was refused and the storage works', () => {
    expect(text(0, 0)).toBe('All saved');
  });

  it('counts the plays waiting to send: the word is "plays" (step 2.37)', () => {
    expect(text(1, 0)).toBe('1 play waiting to send');
    expect(text(12, 0)).toBe('12 plays waiting to send');
  });

  it('says changes of players as changes, plays as plays, and both counts when both wait (step 2.118)', () => {
    const change = (n: number) => ({
      command: {
        commandId: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
        at: 1,
        input: {
          type: 'remove-player' as const,
          side: 'away' as const,
          playerId: `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`,
        },
      },
      moment: null,
    });
    const play = { command: tap(1), moment: null };
    const of = (taps: (typeof play | ReturnType<typeof change>)[], keptOnly = false) =>
      savedBanner({ ...status(taps.length, 0), waitingTaps: taps }, false, keptOnly);
    const five = [1, 2, 3, 4, 5].map(change);
    expect(savedBannerText(of(five), t)).toBe('5 changes of players waiting to send');
    expect(savedBannerText(of([change(1)]), t)).toBe('1 change of players waiting to send');
    expect(savedBannerText(of([play, play]), t)).toBe('2 plays waiting to send');
    const both = of([play, change(1), change(2)]);
    expect(savedBannerText(both, t)).toBe(
      '1 play waiting to send · 2 changes of players waiting to send',
    );
    expect(savedBannerShortLines(both, t)).toEqual(['1 to send', '2 changes to send']);
    expect(savedBannerText(of([change(1), play], true), t)).toBe(
      '1 play kept on this device · 1 change of players kept on this device',
    );
  });

  it('signed out or no longer allowed, never says "waiting to send": the plays are kept (step 2.37, part 2)', () => {
    const kept = savedBanner(status(3, 1), false, true);
    expect(savedBannerText(kept, t)).toBe('3 plays kept on this device · 1 play not saved');
    expect(savedBannerText(kept, t)).not.toMatch(/waiting to send/);
    expect(savedBannerShortLines(kept, t)).toEqual(['3 kept', '1 not saved']);
    expect(savedBannerText(savedBanner(status(1, 0), true, true), t)).toBe(
      'No connection: plays are kept on this device · 1 play kept on this device',
    );
  });

  it('counts refused taps as not saved', () => {
    expect(text(0, 1)).toBe('1 play not saved');
    expect(text(0, 2)).toBe('2 plays not saved');
  });

  it('shows both counts when taps wait and others were refused', () => {
    expect(text(12, 3)).toBe('12 plays waiting to send · 3 plays not saved');
  });

  it('says the storage failed, never that the device is offline (record 024)', () => {
    expect(text(0, 0, true)).toBe('This device could not save to its storage');
    expect(text(2, 1, true)).toBe(
      'This device could not save to its storage · 2 plays waiting to send · 1 play not saved',
    );
  });

  it('with no connection it says so, and never "All saved" (step 2.37)', () => {
    const offline = (waiting: number, refusedCount = 0, storageFailed = false) =>
      savedBanner(status(waiting, refusedCount, storageFailed), true);
    expect(savedBannerText(offline(0), t)).toBe('No connection: plays are kept on this device');
    expect(savedBannerText(offline(3), t)).toBe(
      'No connection: plays are kept on this device · 3 plays waiting to send',
    );
    expect(savedBannerShortLines(offline(0), t)).toEqual(['No connection']);
    expect(savedBannerShortLines(offline(3, 1), t)).toEqual([
      'No connection',
      '3 to send',
      '1 not saved',
    ]);
    // The storage's failure is still said first, and is never called the network.
    expect(savedBannerShortLines(offline(0, 0, true), t)).toEqual([
      'Storage failed',
      'No connection',
    ]);
    // With a connection, as before.
    expect(savedBannerText(savedBanner(status(0, 0), false), t)).toBe('All saved');
  });

  it('says the same shorter, a line for each thing, for a phone short of room', () => {
    const short = (waiting: number, refusedCount: number, storageFailed = false) =>
      savedBannerShortLines(savedBanner(status(waiting, refusedCount, storageFailed)), t);
    expect(short(0, 0)).toEqual(['All saved']);
    expect(short(1, 0)).toEqual(['1 to send']);
    expect(short(12, 3)).toEqual(['12 to send', '3 not saved']);
    // Never fewer lines than the long form, and the storage's failure first there too.
    expect(short(2, 1, true)).toEqual(['Storage failed', '2 to send', '1 not saved']);
    expect(short(0, 0, true)).toEqual(['Storage failed']);
  });
});
