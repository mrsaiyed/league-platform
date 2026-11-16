import { describe, expect, it } from 'vitest';
import { answerParams, done, doneOf, problemKey, refusedBy, refusedHere } from './answer.ts';

describe("Season settings' answers in the address", () => {
  it('carries a done word and reads back only the known ones', () => {
    expect(answerParams(done('shown'))).toEqual({ done: 'shown' });
    expect(doneOf({ done: 'hidden' })).toBe('hidden');
    expect(doneOf({ done: 'deleted' })).toBeUndefined();
    expect(doneOf({ done: ['shown', 'hidden'] })).toBeUndefined();
  });

  it("names the command's own message, then the code's, then a plain one", () => {
    const word = answerParams(refusedBy('leagues.update_season', 'season-not-found'));
    expect(problemKey(word)).toBe('error.leagues.update_season.season-not-found');
    expect(problemKey({ problem: 'leagues.update_season.changed-since-read' })).toBe(
      'error.changed-since-read',
    );
    expect(problemKey({ problem: 'leagues.update_season.not-allowed' })).toBe('error.not-allowed');
    expect(problemKey({ problem: '<b>typed</b>' })).toBe('error.unknown');
    expect(problemKey({})).toBeUndefined();
  });

  it("says the screen's own refusal when the season's state no longer fits", () => {
    expect(problemKey(answerParams(refusedHere('not-hidden')))).toBe(
      'seasonSettings.refused.not-hidden',
    );
    expect(problemKey({ problem: 'not-shown' })).toBe('seasonSettings.refused.not-shown');
  });
});
