import { describe, expect, it } from 'vitest';
import { gameIdOf, typedScoresOf, wrongScoreFields } from './score-fields.ts';

const id = '01900000-0000-7000-8000-006A00000001';
const lower = id.toLowerCase();

describe("the games list's score boxes as the forms send them", () => {
  it('takes a game id and two typed scores only in their own shapes', () => {
    expect(gameIdOf(` ${id} `)).toBe(lower);
    expect(gameIdOf('1')).toBeUndefined();
    expect(typedScoresOf(' 7', '0')).toEqual({ homeScore: '7', awayScore: '0' });
    expect(typedScoresOf('051', '47')).toEqual({ homeScore: '51', awayScore: '47' });
    for (const [home, away] of [
      ['7.5', '0'],
      ['', '0'],
      ['1000', '47'],
      ['-1', '47'],
      ['51', undefined],
    ] as const) {
      expect(typedScoresOf(home, away), `${home} ${away}`).toBeUndefined();
    }
  });

  it('names the boxes that are wrong, in the order they are on the screen', () => {
    expect(wrongScoreFields({ homeScore: '51', awayScore: '47' })).toEqual([]);
    expect(wrongScoreFields({ homeScore: '5.1', awayScore: '47' })).toEqual(['homeScore']);
    expect(wrongScoreFields({ homeScore: '', awayScore: '1000' })).toEqual([
      'awayScore',
      'homeScore',
    ]);
  });
});
