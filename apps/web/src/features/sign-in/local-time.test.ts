// localWhen (step 2.163, M26): a device's time in the reader's own time. The test runs in
// the computer's own time zone, so each moment is made from local parts.
import { describe, expect, it } from 'vitest';
import { localWhen, type LocalTimeWords } from './local-time.tsx';

const words: LocalTimeWords = {
  before: 'Signed in ',
  after: '',
  today: 'today at {time}',
  yesterday: 'yesterday at {time}',
  day: '{date} at {time}',
};

describe('localWhen', () => {
  const now = new Date(2026, 10, 14, 21, 0);
  it('says today and yesterday by the local calendar', () => {
    expect(localWhen(new Date(2026, 10, 14, 20, 41), now, 'en', words)).toBe('today at 8:41 PM');
    expect(localWhen(new Date(2026, 10, 14, 0, 5), now, 'en', words)).toBe('today at 12:05 AM');
    expect(localWhen(new Date(2026, 10, 13, 23, 59), now, 'en', words)).toBe(
      'yesterday at 11:59 PM',
    );
  });
  it('gives the date before that, with the year only when it is not this one', () => {
    expect(localWhen(new Date(2026, 10, 3, 9, 5), now, 'en', words)).toBe('Nov 3 at 9:05 AM');
    expect(localWhen(new Date(2025, 11, 31, 9, 5), now, 'en', words)).toBe(
      'Dec 31, 2025 at 9:05 AM',
    );
  });
});
