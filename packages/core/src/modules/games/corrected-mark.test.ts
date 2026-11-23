import { describe, expect, it } from 'vitest';
import { correctedMarkDate } from './corrected-mark.ts';

const final = (homeScore: number, awayScore: number) => ({
  status: 'final',
  homeScore,
  awayScore,
});

describe('correctedMarkDate (S-8: the mark only when the next final differs)', () => {
  it('shows nothing for a game never corrected', () => {
    expect(correctedMarkDate([], final(50, 40))).toBeUndefined();
  });

  it('shows nothing for a slip undone: reopened and ended again with the same score', () => {
    expect(correctedMarkDate([{ on: '2030-12-06', before: final(50, 40) }], final(50, 40))).toBe(
      undefined,
    );
  });

  it('shows the date when the score at the next final differs', () => {
    expect(correctedMarkDate([{ on: '2030-12-06', before: final(50, 40) }], final(52, 40))).toBe(
      '2030-12-06',
    );
  });

  it('shows the date when a final becomes a forfeit with the same numbers', () => {
    const forfeit = { status: 'forfeit', homeScore: 50, awayScore: 40 };
    expect(correctedMarkDate([{ on: '2030-12-06', before: final(50, 40) }], forfeit)).toBe(
      '2030-12-06',
    );
  });

  it('shows nothing while the reopen is still open: the game is not final yet', () => {
    const reopened = { status: 'scheduled', homeScore: null, awayScore: null };
    expect(correctedMarkDate([{ on: '2030-12-06', before: final(50, 40) }], reopened)).toBe(
      undefined,
    );
    const live = { status: 'live', homeScore: 50, awayScore: 40 };
    expect(correctedMarkDate([{ on: '2030-12-06', before: final(50, 40) }], live)).toBeUndefined();
  });

  it('keeps an earlier real correction when a later reopen changed nothing', () => {
    const corrections = [
      { on: '2030-12-06', before: final(50, 40) },
      { on: '2030-12-08', before: final(52, 40) },
    ];
    expect(correctedMarkDate(corrections, final(52, 40))).toBe('2030-12-06');
  });

  it('dates the mark by the latest correction that changed the result', () => {
    const corrections = [
      { on: '2030-12-06', before: final(50, 40) },
      { on: '2030-12-08', before: final(52, 40) },
    ];
    expect(correctedMarkDate(corrections, final(52, 44))).toBe('2030-12-08');
  });

  it('still shows the mark when a correction is itself put back to the first result', () => {
    // 50-40, fixed to 52-40, then that fix undone: each final differed from the one before.
    const corrections = [
      { on: '2030-12-06', before: final(50, 40) },
      { on: '2030-12-08', before: final(52, 40) },
    ];
    expect(correctedMarkDate(corrections, final(50, 40))).toBe('2030-12-08');
  });
});
