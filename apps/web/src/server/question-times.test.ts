import { describe, expect, it } from 'vitest';
import { questionKeyOf, questionTimes } from './question-times.ts';

const context = { leagueId: 'league-1', accountId: 'account-1' };
const token = '0123456789abcdef0123';
const fields = { requestToken: token, gameId: 'g1', act: 'postpone', step: 'ask' };

describe('when a question was first asked (step 2.221)', () => {
  it('knows a question by who asked, the league, the token, the game and the change', () => {
    const key = questionKeyOf(context, fields);
    expect(key).toBeDefined();
    // The same question from its "Yes" (other fields differ): the same key.
    expect(questionKeyOf(context, { ...fields, step: 'confirm', askedAt: '1' })).toBe(key);
    expect(questionKeyOf({ ...context, accountId: 'account-2' }, fields)).not.toBe(key);
    expect(questionKeyOf({ ...context, leagueId: 'league-2' }, fields)).not.toBe(key);
    expect(questionKeyOf(context, { ...fields, gameId: 'g2' })).not.toBe(key);
    expect(questionKeyOf(context, { ...fields, act: 'cancel' })).not.toBe(key);
    expect(questionKeyOf(context, { ...fields, requestToken: 'not a token' })).toBeUndefined();
    expect(questionKeyOf(context, { gameId: 'g1', act: 'postpone' })).toBeUndefined();
  });

  it('keeps a time until it is forgotten or too old, and the oldest go first', () => {
    let clock = 1_000;
    const times = questionTimes({ keepMs: 500, most: 2, now: () => clock });
    times.keep('a', 1_000);
    expect(times.of('a')).toBe(1_000);
    times.forget('a');
    expect(times.of('a')).toBeUndefined();
    times.keep('a', 1_000);
    times.keep('b', 1_000);
    times.keep('c', 1_000);
    expect(times.of('a')).toBeUndefined();
    expect(times.of('c')).toBe(1_000);
    clock = 1_600;
    expect(times.of('c')).toBeUndefined();
    expect(times.of(undefined)).toBeUndefined();
    times.keep(undefined, 1);
  });
});
