import { describe, expect, it } from 'vitest';
import { boxScoreColumns } from './box-score-columns.ts';

describe('boxScoreColumns', () => {
  it('asks for points and fouls only, without minutes, for points-fouls', () => {
    expect(boxScoreColumns('points-fouls')).toEqual({
      statKeys: ['points', 'fouls'],
      minutes: false,
    });
  });

  it('asks for the standard set and the other counts, with minutes, for full', () => {
    expect(boxScoreColumns('full')).toEqual({
      statKeys: [
        'points',
        'fg3',
        'fg1',
        'fouls',
        'rebounds',
        'assists',
        'steals',
        'blocks',
        'turnovers',
      ],
      minutes: true,
    });
  });

  it('keeps points-only and standard as before', () => {
    expect(boxScoreColumns('points-only')).toEqual({ statKeys: ['points'], minutes: false });
    expect(boxScoreColumns('standard')).toEqual({
      statKeys: ['points', 'fg3', 'fg1', 'fouls'],
      minutes: true,
    });
  });
});
