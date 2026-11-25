import { describe, expect, it } from 'vitest';
import {
  answerParams,
  answerSaid,
  done,
  doneOf,
  earnedDone,
  problemKey,
  refusedBy,
  refusedHere,
  seasonAnswerOf,
  seasonAnswerThing,
} from './answer.ts';

describe("Season settings' answers", () => {
  it('carries a done word and reads back only the known ones', () => {
    expect(answerParams(done('shown'))).toEqual({ done: 'shown' });
    expect(doneOf({ done: 'hidden' })).toBe('hidden');
    expect(doneOf({ done: 'deleted' })).toBeUndefined();
    expect(doneOf({ done: ['shown', 'hidden'] })).toBeUndefined();
  });

  it('says a done word only when the season, read fresh, agrees with it', () => {
    expect(earnedDone({ done: 'shown' }, 'shown')).toBe('shown');
    expect(earnedDone({ done: 'hidden' }, 'hidden')).toBe('hidden');
    expect(earnedDone({ done: 'shown' }, 'hidden')).toBeUndefined();
    expect(earnedDone({ done: 'shown' }, 'over')).toBeUndefined();
    expect(earnedDone({ done: 'hidden' }, 'shown')).toBeUndefined();
    expect(earnedDone({ done: 'hidden' }, 'over')).toBeUndefined();
    expect(earnedDone({}, 'shown')).toBeUndefined();
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

describe('the answer from the one-time notice (step 2.155 part 6)', () => {
  const left = (said: string, slug: string | undefined) => ({
    thing: seasonAnswerThing(slug),
    said,
  });

  it('reads the answer left for the season shown, or for no season named', () => {
    const shown = seasonAnswerOf(left(answerSaid(done('shown')), 'fall'), 'fall');
    expect(earnedDone(shown, 'shown')).toBe('shown');
    const refused = left(
      answerSaid(refusedBy('leagues.update_season', 'season-not-found')),
      undefined,
    );
    expect(problemKey(seasonAnswerOf(refused, 'fall'))).toBe(
      'error.leagues.update_season.season-not-found',
    );
  });

  it("says nothing for no notice, another season's answer or a part's Saved", () => {
    expect(seasonAnswerOf(undefined, 'fall')).toEqual({});
    expect(seasonAnswerOf(left(answerSaid(done('shown')), 'spring'), 'fall')).toEqual({});
    expect(seasonAnswerOf({ thing: 'a-season-id', said: 'game' }, 'fall')).toEqual({});
  });
});
