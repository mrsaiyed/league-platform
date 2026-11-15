import type { GameReopenOffer } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { reopenViewOf } from './reopen-view.ts';

/** The tracker's answer, as games.read_reopen_offer gives it. */
const no = (offer: GameReopenOffer) => offer;

describe('what a final game says about putting it right (step 2.154)', () => {
  it('offers the tracker’s door when the tracker’s read offers it, with its time', () => {
    expect(reopenViewOf({ reopen: { when: 'always' }, endedBy: null }, false)).toEqual({
      kind: 'correct',
      door: 'tracked',
      until: null,
    });
    expect(reopenViewOf({ reopen: { when: 'until', until: 1000 }, endedBy: 'a' }, false)).toEqual({
      kind: 'correct',
      door: 'tracked',
      until: 1000,
    });
  });

  it("offers the admin's door for a game decided by hand to whoever may correct games", () => {
    const byHand = no({ reopen: { when: 'no', code: 'not-ended-by-tracker' }, endedBy: null });
    expect(reopenViewOf(byHand, true)).toEqual({ kind: 'correct', door: 'by-hand', until: null });
    expect(reopenViewOf(undefined, true)).toEqual({
      kind: 'correct',
      door: 'by-hand',
      until: null,
    });
    expect(reopenViewOf(byHand, false)).toEqual({ kind: 'who', because: 'admins' });
  });

  it('says who can to everyone else, and when their own time is over', () => {
    const over = no({ reopen: { when: 'no', code: 'reopen-time-over' }, endedBy: 'a' });
    expect(reopenViewOf(over, false)).toEqual({ kind: 'who', because: 'time-over' });
    for (const code of ['not-ended-by-you', 'scorekeepers-may-not-reopen'] as const) {
      expect(reopenViewOf({ reopen: { when: 'no', code }, endedBy: 'a' }, false)).toEqual({
        kind: 'who',
        because: 'admins',
      });
    }
    const open = no({ reopen: { when: 'no', code: 'game-not-decided' }, endedBy: null });
    expect(reopenViewOf(open, true)).toEqual({ kind: 'none' });
  });
});
