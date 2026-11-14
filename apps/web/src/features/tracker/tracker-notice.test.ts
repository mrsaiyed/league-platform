import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import type { ReadOnlyReason } from './tracker-controller.ts';
import { trackerNoticeText, trackerNotices } from './tracker-notice.ts';

const t = createTranslator('en');
const refused = { command: tap(1), refusal: { code: 'rule', message: '' } } as const;
const reasons: readonly ReadOnlyReason[] = [
  'taken-over',
  'expired',
  'released',
  'not-held',
  'game-not-live',
  'not-allowed',
  'unknown-game',
  'signed-out',
  'update-needed',
  'request-refused',
  'storage-failed',
];
const texts = (status: Parameters<typeof trackerNotices>[0]) =>
  trackerNotices(status).map((notice) => trackerNoticeText(notice, t));

describe('tracker notices (T6 §5, T-113)', () => {
  it('says nothing while scoring with every tap in', () => {
    expect(texts({ mode: { kind: 'scoring' }, notApplied: [], notSaved: [] })).toEqual([]);
  });

  it('says why the device is read-only, in words, for every reason', () => {
    for (const reason of reasons) {
      const [text] = texts({ mode: { kind: 'read-only', reason }, notApplied: [], notSaved: [] });
      expect(text).toMatch(/^[A-Z].+\.$/);
      expect(text).not.toContain('tracker.');
    }
    expect(
      texts({ mode: { kind: 'read-only', reason: 'taken-over' }, notApplied: [], notSaved: [] }),
    ).toEqual(['Another device has taken over scoring this game. This one is now read-only.']);
  });

  it('names who holds the game, and counts the taps not saved and not applied', () => {
    expect(
      texts({
        mode: { kind: 'held-by-other', holder: { displayName: 'Sam Scorekeeper', since: 0 } },
        notApplied: [refused, refused],
        notSaved: [tap(2)],
      }),
    ).toEqual([
      'Sam Scorekeeper is scoring this game on another device.',
      '1 action on this device was not saved. Enter it again if it is needed.',
      '2 actions were not applied. The game now shows what was saved.',
    ]);
  });
});
