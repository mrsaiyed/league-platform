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

  describe('a put back of the sheet (S-98: it applies S-81 to a put back)', () => {
    const reopened = { status: 'scheduled', homeScore: null, awayScore: null };

    it('leaves no mark from the reopen it undid when the result is as before the reopen', () => {
      // 50-40 reopened, saved as 20-0 (a final score only or a forfeit), then put back.
      const corrections = [
        { on: '2030-12-06', before: final(50, 40), after: reopened },
        {
          on: '2030-12-07',
          before: { status: 'forfeit', homeScore: 20, awayScore: 0 },
          after: final(50, 40),
        },
      ];
      expect(correctedMarkDate(corrections, final(50, 40))).toBeUndefined();
    });

    it('keeps the mark and date of an earlier correction that did change the result', () => {
      const corrections = [
        { on: '2030-12-04', before: final(48, 40), after: reopened },
        { on: '2030-12-06', before: final(50, 40), after: reopened },
        { on: '2030-12-07', before: final(20, 0), after: final(50, 40) },
      ];
      expect(correctedMarkDate(corrections, final(50, 40))).toBe('2030-12-04');
    });

    // T-368: a put back looks back past reopens whose save kept no lines, so it undoes
    // the whole slip: those reopens are part of it and mark nothing.
    it('leaves no mark when a put back undoes a chain of reopens', () => {
      const corrections = [
        { on: '2030-12-06', before: final(50, 40), after: reopened, keptSheet: true },
        { on: '2030-12-07', before: final(52, 48), after: reopened, keptSheet: false },
        {
          on: '2030-12-08',
          before: { status: 'forfeit', homeScore: 20, awayScore: 0 },
          after: final(50, 40),
          keptSheet: false,
        },
      ];
      expect(correctedMarkDate(corrections, final(50, 40))).toBeUndefined();
      const later = [
        ...corrections,
        { on: '2030-12-09', before: final(50, 40), after: reopened, keptSheet: true },
      ];
      expect(correctedMarkDate(later, final(51, 40))).toBe('2030-12-09');
    });

    it('marks a later reopen after the put back as any other', () => {
      const corrections = [
        { on: '2030-12-06', before: final(50, 40), after: reopened },
        { on: '2030-12-07', before: final(20, 0), after: final(50, 40) },
        { on: '2030-12-09', before: final(50, 40), after: reopened },
      ];
      expect(correctedMarkDate(corrections, final(51, 40))).toBe('2030-12-09');
      expect(correctedMarkDate(corrections, final(50, 40))).toBeUndefined();
    });
  });
});
