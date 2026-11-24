import type { GameReopenOffer, OwnResultOffer } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { reopenViewOf, sheetReopenViewOf } from './reopen-view.ts';

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

describe('a result recorded by hand, for the scorekeeper who recorded it (step 2.177, S-52)', () => {
  const byHand = no({ reopen: { when: 'no', code: 'not-ended-by-tracker' }, endedBy: null });
  const own = (reopen: OwnResultOffer['reopen']): OwnResultOffer => ({ reopen, recordedBy: 'a' });

  it('offers their own door until the minutes run out', () => {
    expect(reopenViewOf(byHand, false, own({ when: 'until', until: 5000 }))).toEqual({
      kind: 'correct',
      door: 'own',
      until: 5000,
    });
    expect(reopenViewOf(undefined, false, own({ when: 'until', until: 5000 }))).toMatchObject({
      door: 'own',
    });
  });

  it('says who can once the minutes are over, for someone else’s entry, and when overturned', () => {
    const view = (code: Parameters<typeof own>[0]) => reopenViewOf(byHand, false, own(code));
    expect(view({ when: 'no', code: 'reopen-time-over' })).toEqual({
      kind: 'who',
      because: 'time-over',
    });
    for (const code of ['not-recorded-by-you', 'scorekeepers-may-not-reopen'] as const) {
      expect(view({ when: 'no', code })).toEqual({ kind: 'who', because: 'admins' });
    }
    expect(view({ when: 'no', code: 'result-overturned' })).toEqual({
      kind: 'who',
      because: 'overturned',
    });
  });

  it('says the season is archived, for their own entry and the tracker’s read (step 2.130)', () => {
    expect(reopenViewOf(byHand, false, own({ when: 'no', code: 'season-archived' }))).toEqual({
      kind: 'who',
      because: 'archived',
    });
    const tracked = no({ reopen: { when: 'no', code: 'season-archived' }, endedBy: 'a' });
    expect(reopenViewOf(tracked, false)).toEqual({ kind: 'who', because: 'archived' });
  });

  it('keeps the admin’s door for whoever may correct games, whatever the own read says', () => {
    expect(reopenViewOf(byHand, true, own({ when: 'no', code: 'not-recorded-by-you' }))).toEqual({
      kind: 'correct',
      door: 'by-hand',
      until: null,
    });
  });

  it('offers it on the game’s own page too, where the sheet is not locked as tracked', () => {
    const sheet = {
      mayReopen: false,
      mayCorrect: false,
      locked: 'decided',
      game: { status: 'final', overturned: false },
    } as const;
    expect(sheetReopenViewOf(sheet, undefined, own({ when: 'until', until: 9 }))).toEqual({
      kind: 'correct',
      door: 'own',
      until: 9,
    });
    expect(sheetReopenViewOf(sheet, undefined, undefined)).toEqual({ kind: 'none' });
  });
});
