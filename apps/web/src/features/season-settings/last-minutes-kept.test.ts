import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { lastMinutesKeptNote } from './last-minutes-kept.ts';

const withClock = (clock: Partial<SeasonRules['clock']>): SeasonRules => {
  const rules = defaultSeasonRules();
  return { ...rules, clock: { ...rules.clock, ...clock } };
};

const kept = (minutes: string) =>
  `Fall 2026 also stops the clock in the last ${minutes}. The new season keeps that with either clock; you can change it in its settings.`;

describe('lastMinutesKeptNote (step 2.245, review M1; step 2.248)', () => {
  it('says the copied last-minutes stop clock is kept, with either clock', () => {
    expect(
      lastMinutesKeptNote('Fall 2026', withClock({ mode: 'running', stopClockLastSeconds: 120 })),
    ).toBe(kept('2 minutes'));
    expect(
      lastMinutesKeptNote(
        'Fall 2026',
        withClock({ mode: 'stop', stopClockLastSeconds: 120, mercyLead: 10 }),
      ),
    ).toBe(kept('2 minutes'));
  });

  it('says one minute in the singular, from the message file’s plural form', () => {
    const said = lastMinutesKeptNote(
      'Fall 2026',
      withClock({ mode: 'running', stopClockLastSeconds: 60 }),
    );
    expect(said).toBe(kept('minute'));
    expect(said).not.toContain('1 minutes');
  });

  it('names a part of a minute as the settings do', () => {
    expect(
      lastMinutesKeptNote('Fall 2026', withClock({ mode: 'running', stopClockLastSeconds: 90 })),
    ).toContain('in the last 1.5 minutes.');
  });

  it('says nothing when the copied season has no last-minutes stop clock, or nothing is copied', () => {
    expect(
      lastMinutesKeptNote('Fall 2026', withClock({ mode: 'running', stopClockLastSeconds: null })),
    ).toBeUndefined();
    expect(lastMinutesKeptNote('Fall 2026', withClock({ mode: 'stop' }))).toBeUndefined();
    expect(
      lastMinutesKeptNote(undefined, withClock({ mode: 'running', stopClockLastSeconds: 120 })),
    ).toBeUndefined();
  });
});
