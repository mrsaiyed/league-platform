import { describe, expect, it } from 'vitest';
import { divisionProblemKey, wrongDivisionFields } from './division-answers.ts';

describe('a refused change to a division', () => {
  it('says why in the message files, and marks the name only when the name is wrong', () => {
    expect(divisionProblemKey('division-name-taken')).toBe(
      'adminDivisions.problem.division-name-taken',
    );
    expect(wrongDivisionFields('division-name-taken')).toEqual(['name']);
    expect(wrongDivisionFields('invalid-input')).toEqual(['name']);
    expect(wrongDivisionFields('division-has-teams')).toEqual([]);
  });
  it('tells someone putting one back to rename the other, and never shows a code', () => {
    expect(divisionProblemKey('division-name-taken', true)).toBe(
      'adminDivisions.problem.restore-name-taken',
    );
    expect(divisionProblemKey('something-new')).toBe('adminDivisions.problem.unknown');
  });
});
