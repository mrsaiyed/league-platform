import { describe, expect, it } from 'vitest';
import { scorekeeperProblemKey, wrongScorekeeperFields } from './scorekeeper-answers.ts';

describe('scorekeeper answers', () => {
  it('marks the person chosen when the refusal is about them', () => {
    expect(wrongScorekeeperFields('cannot-score-game')).toEqual(['person']);
    expect(wrongScorekeeperFields('already-assigned')).toEqual(['person']);
    expect(wrongScorekeeperFields('game-closed')).toEqual([]);
  });

  it('says each known refusal in its own words, and anything else plainly', () => {
    expect(scorekeeperProblemKey('game-closed')).toBe('adminScorekeepers.problem.game-closed');
    expect(scorekeeperProblemKey('invalid-input')).toBe('adminScorekeepers.problem.unknown');
  });
});
