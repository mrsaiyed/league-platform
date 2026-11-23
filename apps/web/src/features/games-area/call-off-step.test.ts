import { describe, expect, it } from 'vitest';
import { askRestMs, callOffStep } from './call-off-step.ts';

const now = 1_000_000;
const yes = (act: string, more: Record<string, string> = {}) => ({
  act,
  step: 'confirm',
  confirmed: 'yes',
  ...more,
});
const asked = (act: string, askedAt = now) => ({
  kind: 'ask',
  act,
  askedAt,
  readyInMs: askRestMs - (now - askedAt),
});

describe('a post of "Forfeit, postpone or cancel" (step 2.158)', () => {
  it('only asks on the first post of each change, stamped with the server’s time', () => {
    for (const act of ['postpone', 'cancel']) {
      expect(callOffStep({ act, step: 'ask' }, now)).toEqual(asked(act));
      // Asking anew (the asking form sent again) starts a new question.
      expect(callOffStep({ act, step: 'ask' }, now, now - 5_000)).toEqual(asked(act));
    }
    expect(callOffStep({ act: 'forfeit', step: 'ask', forfeitingTeamId: 't1' }, now)).toEqual(
      asked('forfeit'),
    );
  });

  it('runs the change only on the question’s confirmed "Yes", read for long enough', () => {
    expect(callOffStep(yes('cancel'), now, now - askRestMs)).toEqual({
      kind: 'run',
      act: 'cancel',
    });
    expect(callOffStep(yes('cancel'), now, now - 5_000)).toEqual({ kind: 'run', act: 'cancel' });
  });

  it('asks again for a skipped question, a "Yes" that never asked, or one sent too soon', () => {
    // Straight to "confirm" with no question kept for it (a hand-made post, step 2.221):
    // the form's own time is never read, however old it says the question is.
    expect(callOffStep(yes('postpone'), now)).toEqual(asked('postpone'));
    expect(callOffStep(yes('postpone', { askedAt: String(now - 60_000) }), now)).toEqual(
      asked('postpone'),
    );
    // Not confirmed, or confirmed by some other word: a question anew.
    expect(callOffStep({ ...yes('postpone'), confirmed: 'no' }, now, now - 5_000)).toEqual(
      asked('postpone'),
    );
    // A time kept from the future is not taken as read.
    expect(callOffStep(yes('postpone'), now, now + 10)).toEqual(asked('postpone'));
  });

  it('keeps the first time when a "Yes" comes too soon, so the wait never starts again', () => {
    // The second tap of a double tap, 100 to 900 ms after the question was drawn.
    for (const gap of [100, 150, 300, 600, 900]) {
      expect(callOffStep(yes('postpone'), now, now - gap)).toEqual(asked('postpone', now - gap));
    }
    // "Yes" tapped every 300 ms: the taps too soon keep the first time; the first tap once
    // the wait is over runs the change.
    const first = now;
    const answers = [300, 600, 900, 1_200].map((at) =>
      callOffStep(yes('cancel'), first + at, first),
    );
    expect(answers.map((a) => a?.kind)).toEqual(['ask', 'ask', 'ask', 'run']);
    expect(answers.slice(0, 3).map((a) => (a?.kind === 'ask' ? a.askedAt : 0))).toEqual([
      first,
      first,
      first,
    ]);
    expect(answers.slice(0, 3).map((a) => (a?.kind === 'ask' ? a.readyInMs : 0))).toEqual([
      askRestMs - 300,
      askRestMs - 600,
      askRestMs - 900,
    ]);
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
        callOffStep({ ...yes('forfeit'), forfeitingTeamId: team ?? '' }, now, now - 5_000),
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
