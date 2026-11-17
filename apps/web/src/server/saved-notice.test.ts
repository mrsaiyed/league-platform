import { describe, expect, it } from 'vitest';
import {
  noticeHolderOf,
  savedNotices,
  savedNoticesHere,
  type SavedNotice,
} from './saved-notice.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const game = '01900000-0000-7000-8000-006a00000001';
const final: SavedNotice = { screen: 'games', thing: game, said: 'final' };

describe('the one-time "Saved" notice (T-271)', () => {
  it('is said once: taking it clears it, so a reload shows nothing old', () => {
    const notices = savedNotices({ keepMs: 60_000, most: 10 });
    notices.leave('p', final);
    expect(notices.take('p', 'games')).toEqual(final);
    expect(notices.take('p', 'games')).toBeUndefined();
  });

  it("keeps the schedule's second id, the round a game was removed from (step 2.185)", () => {
    const notices = savedNotices({ keepMs: 60_000, most: 10 });
    const removed: SavedNotice = {
      screen: 'schedule',
      thing: game,
      said: 'game-removed',
      about: leagueId,
    };
    notices.leave('p', removed);
    expect(notices.take('p', 'games')).toBeUndefined();
    expect(notices.take('p', 'schedule')).toEqual(removed);
    expect(notices.take('p', 'schedule')).toBeUndefined();
  });

  it('is for one person in one league, and one screen', () => {
    const notices = savedNotices({ keepMs: 60_000, most: 10 });
    const holder = noticeHolderOf({ leagueId, accountId: owner }) ?? '';
    notices.leave(holder, final);
    expect(notices.take(noticeHolderOf({ leagueId, accountId: 'someone' }) ?? '', 'games')).toBe(
      undefined,
    );
    expect(
      notices.take(noticeHolderOf({ leagueId: 'other', accountId: owner }) ?? '', 'games'),
    ).toBeUndefined();
    // Another screen drawn first does not take it.
    expect(notices.take(holder, 'box-score')).toBeUndefined();
    expect(notices.take(holder, 'games')).toEqual(final);
    expect(noticeHolderOf({ leagueId, accountId: null })).toBeUndefined();
  });

  it('holds the last save only, and nothing after its minute', () => {
    let clock = 0;
    const notices = savedNotices({ keepMs: 60_000, most: 2, now: () => clock });
    notices.leave('p', final);
    notices.leave('p', { ...final, said: 'reopen' });
    expect(notices.take('p', 'games')?.said).toBe('reopen');
    notices.leave('p', final);
    clock = 61_000;
    expect(notices.take('p', 'games')).toBeUndefined();
    // The oldest go first when it holds the most.
    notices.leave('a', final);
    notices.leave('b', final);
    notices.leave('c', final);
    expect(notices.take('a', 'games')).toBeUndefined();
    expect(notices.take('c', 'games')).toEqual(final);
  });

  it('is one store for the whole server', () => {
    expect(savedNoticesHere()).toBe(savedNoticesHere());
  });
});
