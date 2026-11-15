import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { tap } from './queue-storage-contract.test-helper.ts';
import type { ReadOnlyReason } from './tracker-controller.ts';
import { trackerNoticeText, trackerNotices } from './tracker-notice.ts';

const t = createTranslator('en');
const refused = { command: tap(1), refusal: { code: 'rule', message: '' } } as const;
const kept = (n: number) => ({ command: tap(n), moment: null });
const reasons: readonly ReadOnlyReason[] = [
  'taken-over',
  'expired',
  'released',
  'not-held',
  'game-not-live',
  'not-allowed',
  'unknown-game',
  'signed-out',
  'signed-in-as-other',
  'update-needed',
  'request-refused',
  'storage-failed',
];
const calm = { notApplied: [], notSaved: [], signedOut: false, waiting: [] };
const texts = (status: Parameters<typeof trackerNotices>[0]) =>
  trackerNotices(status).map((notice) => trackerNoticeText(notice, t));

describe('tracker notices (T6 §5, T-113)', () => {
  it('says nothing while scoring with every tap in', () => {
    expect(texts({ ...calm, mode: { kind: 'scoring' } })).toEqual([]);
    // Taps waiting to send while signed in are the banner's to count, not a notice.
    expect(texts({ ...calm, mode: { kind: 'scoring' }, waiting: [kept(1)] })).toEqual([]);
  });

  it('says why the device is read-only, in words, for every reason', () => {
    for (const reason of reasons) {
      const [text] = texts({ ...calm, mode: { kind: 'read-only', reason } });
      expect(text).toMatch(/^[A-Z].+\.$/);
      expect(text).not.toContain('tracker.');
    }
    expect(texts({ ...calm, mode: { kind: 'read-only', reason: 'taken-over' } })).toEqual([
      'Someone else is now scoring this game on another device. This device can no longer score it.',
    ]);
  });

  it('signed in as someone else is not called a takeover by another device (finding L5)', () => {
    const [text] = texts({ ...calm, mode: { kind: 'read-only', reason: 'signed-in-as-other' } });
    expect(text).toContain('someone else is signed in here now');
    expect(text).not.toBe(texts({ ...calm, mode: { kind: 'read-only', reason: 'taken-over' } })[0]);
  });

  it('names who holds the game, and counts the taps not saved and not applied', () => {
    expect(
      texts({
        ...calm,
        mode: { kind: 'held-by-other', holder: { displayName: 'Sam Scorekeeper', since: 0 } },
        notApplied: [refused, refused],
        notSaved: [kept(2)],
      }),
    ).toEqual([
      'Sam Scorekeeper is scoring this game on another device.',
      '1 action on this device was not saved. Enter it again if it is needed.',
      '2 actions were not applied. The game now shows what was saved.',
    ]);
  });

  it('says so when signed out while scoring, and how many plays are kept for it (finding M2)', () => {
    expect(texts({ ...calm, mode: { kind: 'scoring' }, signedOut: true })).toEqual([
      'You are signed out. Keep scoring: what you enter is kept on this device and sent once you sign in again.',
    ]);
    expect(
      texts({ ...calm, mode: { kind: 'scoring' }, signedOut: true, waiting: [kept(1), kept(2)] }),
    ).toEqual([
      'You are signed out. 2 plays are being kept on this device and are sent once you sign in again.',
    ]);
    expect(
      texts({ ...calm, mode: { kind: 'scoring' }, signedOut: true, waiting: [kept(1)] }),
    ).toEqual([
      'You are signed out. 1 play is being kept on this device and is sent once you sign in again.',
    ]);
  });

  it('no longer allowed with plays still on the device: they are kept, not saved, and go if the game is given back (finding M2)', () => {
    const waiting = [kept(1), kept(2), kept(3)];
    expect(texts({ ...calm, mode: { kind: 'read-only', reason: 'not-allowed' }, waiting })).toEqual(
      [
        'You are no longer allowed to score this game. 3 plays are still on this device and are not saved. If an admin gives the game back to you, open it again here and they are sent.',
      ],
    );
    // With nothing on the device, it is the plain refusal.
    expect(texts({ ...calm, mode: { kind: 'read-only', reason: 'not-allowed' } })).toEqual([
      'You do not have access to score this game.',
    ]);
  });

  it('never calls plays that will not go by themselves "waiting to send" (finding M2)', () => {
    const waiting = [kept(1), kept(2)];
    const statuses: Parameters<typeof trackerNotices>[0][] = [
      { ...calm, mode: { kind: 'scoring' }, signedOut: true, waiting },
      { ...calm, mode: { kind: 'read-only', reason: 'not-allowed' }, waiting },
    ];
    for (const status of statuses) {
      for (const text of texts(status)) expect(text).not.toMatch(/waiting to send/i);
    }
  });
});
