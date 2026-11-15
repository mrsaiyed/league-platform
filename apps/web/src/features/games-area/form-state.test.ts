import { describe, expect, it } from 'vitest';
import { fillScores, typedOf } from './form-state.ts';

describe("what the games area's forms are answered with", () => {
  it('keeps what a form held exactly as typed, without the framework’s own fields', () => {
    const form = new FormData();
    form.set('homeScore', ' 051 ');
    form.set('awayScore', '');
    form.set('$ACTION_KEY', 'k0');
    form.set('$ACTION_REF_1', '');
    form.set('photo', new Blob(['x']));
    expect(typedOf(form)).toEqual({ homeScore: ' 051 ', awayScore: '' });
  });

  it('puts both scores into a sentence written for them', () => {
    expect(
      fillScores('Tigers {awayScore}, Lions {homeScore}. {homeScore}!', { home: 50, away: '50' }),
    ).toBe('Tigers 50, Lions 50. 50!');
  });
});
