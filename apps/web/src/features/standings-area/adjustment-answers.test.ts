import { describe, expect, it } from 'vitest';
import {
  adjustmentProblemKey,
  countOf,
  readCounts,
  reasonProblem,
  wrongAdjustmentFields,
} from './adjustment-answers.ts';

describe('the adjustments form', () => {
  it('reads an empty box as 0 and a minus sign, typed or printed, as taking away', () => {
    expect(countOf('')).toBe(0);
    expect(countOf(' -2 ')).toBe(-2);
    expect(countOf('−3')).toBe(-3);
    expect(countOf('+1')).toBe(1);
    expect(countOf('two')).toBeUndefined();
    expect(countOf('1.5')).toBeUndefined();
  });

  it('marks the first box that is not a whole number, or wins when nothing changes', () => {
    expect(readCounts({ wins: '', losses: 'x', points: '-2' })).toEqual({
      ok: false,
      code: 'invalid-number',
      box: 'losses',
    });
    expect(readCounts({ wins: '0', losses: '' })).toEqual({
      ok: false,
      code: 'nothing-changes',
      box: 'wins',
    });
    expect(readCounts({ points: '-2' })).toEqual({
      ok: true,
      counts: { wins: 0, losses: 0, ties: 0, points: -2 },
    });
  });

  it('asks for a reason of at most 500 letters', () => {
    expect(reasonProblem('  ')).toBe('reason-missing');
    expect(reasonProblem('x'.repeat(501))).toBe('reason-too-long');
    expect(reasonProblem('Forfeit penalty')).toBeUndefined();
  });

  it('marks the team for a team not in the season, and says a sentence for every code', () => {
    expect(wrongAdjustmentFields('team-not-found')).toEqual(['team']);
    expect(wrongAdjustmentFields('adjustment-not-counted')).toEqual([]);
    expect(wrongAdjustmentFields('invalid-number', 'ties')).toEqual(['ties']);
    expect(adjustmentProblemKey('reason-missing')).toBe('adminStandings.problem.reason-missing');
    expect(adjustmentProblemKey('something-else')).toBe('adminStandings.problem.unknown');
  });
});
