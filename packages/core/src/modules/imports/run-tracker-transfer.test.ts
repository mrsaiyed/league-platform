// The run's own checks (step 2.58), on made-up values only. The run as a whole, against
// a database, is packages/database/src/transfers/transfer-tracker-games.test.ts.
import { describe, expect, it } from 'vitest';
import { resultProblem } from './run-tracker-transfer.ts';

describe('the result a transferred game ends with', () => {
  const tracker = { homeScore: 52, awayScore: 48 };

  it('is final with the tracker’s score', () => {
    expect(resultProblem({ status: 'final', homeScore: 52, awayScore: 48 }, tracker)).toBeNull();
  });

  it('is a problem when the game is not final here, or its score is another', () => {
    expect(resultProblem({ status: 'live', homeScore: 52, awayScore: 48 }, tracker)).toEqual({
      kind: 'result-differs',
      status: 'live',
      here: { home: 52, away: 48 },
      tracker: { home: 52, away: 48 },
    });
    expect(resultProblem({ status: 'final', homeScore: 50, awayScore: 48 }, tracker)).toEqual({
      kind: 'result-differs',
      status: 'final',
      here: { home: 50, away: 48 },
      tracker: { home: 52, away: 48 },
    });
    expect(resultProblem({ status: 'forfeit', homeScore: null, awayScore: null }, tracker)).toEqual(
      expect.objectContaining({ kind: 'result-differs', status: 'forfeit' }),
    );
  });
});
