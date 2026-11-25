import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { stopClockDroppedNote } from './stop-clock-dropped.ts';

const withClock = (clock: Partial<SeasonRules['clock']>): SeasonRules => {
  const rules = defaultSeasonRules();
  return { ...rules, clock: { ...rules.clock, ...clock } };
};

describe('stopClockDroppedNote (step 2.245, review M1)', () => {
  it('says the copied last-minutes stop clock is replaced by a stop clock for the whole game', () => {
    expect(
      stopClockDroppedNote('Fall 2026', withClock({ mode: 'running', stopClockLastSeconds: 120 })),
    ).toBe(
      'Fall 2026 also stops the clock in the last 2 minutes. A stop clock for the whole game replaces that.',
    );
  });

  it('names a part of a minute as the settings do', () => {
    expect(
      stopClockDroppedNote('Fall 2026', withClock({ mode: 'running', stopClockLastSeconds: 90 })),
    ).toContain('in the last 1.5 minutes.');
  });

  it('says nothing when the copied season has no last-minutes stop clock, or nothing is copied', () => {
    expect(
      stopClockDroppedNote('Fall 2026', withClock({ mode: 'running', stopClockLastSeconds: null })),
    ).toBeUndefined();
    expect(stopClockDroppedNote('Fall 2026', withClock({ mode: 'stop' }))).toBeUndefined();
    expect(
      stopClockDroppedNote(undefined, withClock({ mode: 'running', stopClockLastSeconds: 120 })),
    ).toBeUndefined();
  });
});
