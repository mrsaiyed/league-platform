import { describe, expect, it } from 'vitest';
import { askRestMs, callOffStep } from './call-off-step.ts';

const now = 1_000_000;
const yes = (act: string, askedAt: number, more: Record<string, string> = {}) => ({
  act,
  step: 'confirm',
  confirmed: 'yes',
  askedAt: String(askedAt),
  ...more,
});

describe('a post of "Forfeit, postpone or cancel" (step 2.158)', () => {
  it('only asks on the first post of each change, stamped with the server’s time', () => {
    for (const act of ['postpone', 'cancel']) {
      expect(callOffStep({ act, step: 'ask' }, now)).toEqual({ kind: 'ask', act, askedAt: now });
    }
    expect(callOffStep({ act: 'forfeit', step: 'ask', forfeitingTeamId: 't1' }, now)).toEqual({
      kind: 'ask',
      act: 'forfeit',
      askedAt: now,
    });
  });

  it('runs the change only on the question’s confirmed "Yes", read for long enough', () => {
    expect(callOffStep(yes('cancel', now - askRestMs), now)).toEqual({
      kind: 'run',
      act: 'cancel',
    });
    expect(callOffStep(yes('cancel', now - 5_000), now)).toEqual({ kind: 'run', act: 'cancel' });
  });

  it('asks again for a skipped question, a "Yes" that never asked, or one sent too soon', () => {
    const asksAgain = { kind: 'ask', act: 'postpone', askedAt: now };
    // Straight to "confirm" with no question drawn first.
    expect(callOffStep({ act: 'postpone', step: 'confirm', confirmed: 'yes' }, now)).toEqual(
      asksAgain,
    );
    // Not confirmed, or confirmed by some other word.
    expect(callOffStep({ ...yes('postpone', now - 5_000), confirmed: 'no' }, now)).toEqual(
      asksAgain,
    );
    // The second tap of a double tap, 150 or 600 ms after the question was drawn.
    expect(callOffStep(yes('postpone', now - 150), now)).toEqual(asksAgain);
    expect(callOffStep(yes('postpone', now - 600), now)).toEqual(asksAgain);
    // A time from the future, or not a time at all.
    expect(callOffStep(yes('postpone', now + 10), now)).toEqual(asksAgain);
    expect(callOffStep({ ...yes('postpone', 0), askedAt: 'soon' }, now)).toEqual(asksAgain);
  });

  it('refuses a forfeit whose team was left empty, and a put-back with no reason', () => {
    for (const team of [undefined, '', '  ']) {
      const fields = {
        act: 'forfeit',
        step: 'ask',
        ...(team === undefined ? {} : { forfeitingTeamId: team }),
      };
      expect(callOffStep(fields, now)).toEqual({
        kind: 'refused',
        code: 'choose-team',
        field: 'forfeitingTeamId',
      });
      // Even on a "Yes": the team is never filled in for the person.
      expect(
        callOffStep({ ...yes('forfeit', now - 5_000), forfeitingTeamId: team ?? '' }, now),
      ).toMatchObject({
        kind: 'refused',
      });
    }
    expect(callOffStep({ act: 'restore', step: 'ask' }, now)).toEqual({
      kind: 'refused',
      code: 'choose-reason',
      field: 'reason',
    });
  });

  it('goes back on "No", and knows no other change', () => {
    expect(callOffStep({ act: 'cancel', step: 'back' }, now)).toEqual({ kind: 'back' });
    expect(callOffStep({ act: 'delete', step: 'ask' }, now)).toBeUndefined();
    expect(callOffStep({ step: 'ask' }, now)).toBeUndefined();
  });
});
