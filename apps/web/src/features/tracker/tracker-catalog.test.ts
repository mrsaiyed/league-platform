import { createTranslator, en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { savedBanner, savedBannerText } from './queue-banner.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import { trackerNoticeText } from './tracker-notice.ts';

describe('the words handed to the tracker’s device', () => {
  it('are the tracker’s messages only', () => {
    const catalog = trackerCatalog(en);
    expect(Object.keys(catalog).length).toBeGreaterThan(10);
    expect(Object.keys(catalog).every((key) => key.startsWith('tracker.'))).toBe(true);
    expect(catalog['tracker.title']).toBe(en['tracker.title']);
  });

  it('are enough for the tracker’s notices and banner', () => {
    const t = createTranslator('en', { en: trackerCatalog(en) });
    expect(savedBannerText(savedBanner({ waiting: 2, refused: [], storageFailure: null }), t)).toBe(
      '2 actions waiting to send',
    );
    expect(trackerNoticeText({ key: 'tracker.heldByOther', name: 'Sam' }, t)).toBe(
      'Sam is scoring this game on another device.',
    );
    expect(trackerNoticeText({ key: 'tracker.readOnly.signed-out' }, t)).toBe(
      en['tracker.readOnly.signed-out'],
    );
  });
});
