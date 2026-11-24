import { en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { boxScoreProblemKey, gamesProblemKey, putBackProblemKey } from './problem-keys.ts';

const codes = [
  'not-allowed',
  'invalid-input',
  'game-not-found',
  'changed-since-read',
  'game-already-decided',
  'game-cancelled',
  'tie-not-allowed',
  'team-not-in-game',
  'game-is-tracked',
  'game-not-postponable',
  'game-not-cancellable',
  'reopen-reason',
  'player-not-on-team',
  'player-listed-twice',
  'did-not-play-has-stats',
  'game-not-decided',
  'reopen-time-over',
];

describe('why a change in the games area was refused, as words', () => {
  it('words every code the games list knows by its own sentence', () => {
    for (const code of codes.slice(0, 11)) {
      expect(gamesProblemKey(code), code).toBe(`admin.games.error.${code}`);
    }
  });

  it('words the grid by its own sentences first, else the games list’s', () => {
    expect(boxScoreProblemKey('invalid-input')).toBe('admin.boxScore.error.invalid-input');
    expect(boxScoreProblemKey('reopen-reason')).toBe('admin.boxScore.error.reopen-reason');
    expect(boxScoreProblemKey('game-is-tracked')).toBe('admin.boxScore.error.game-is-tracked');
    expect(boxScoreProblemKey('changed-since-read')).toBe('admin.games.error.changed-since-read');
    expect(boxScoreProblemKey('tie-not-allowed')).toBe('admin.games.error.tie-not-allowed');
  });

  it('says "that did not work" for anything else, never the code itself', () => {
    for (const odd of ['', '<b>', 'something-else', 'toString', '__proto__']) {
      expect(gamesProblemKey(odd), odd).toBe('admin.games.error.unknown');
      expect(boxScoreProblemKey(odd), odd).toBe('admin.games.error.unknown');
    }
  });

  it('every sentence it gives is in the message file', () => {
    const keys = new Set(Object.keys(en));
    for (const code of [...codes, 'unknown']) {
      expect(keys.has(gamesProblemKey(code)), code).toBe(true);
      expect(keys.has(boxScoreProblemKey(code)), code).toBe(true);
    }
  });

  it('words a put back of the sheet refused by its own sentences (step 2.229)', () => {
    for (const code of ['newer-save', 'no-sheet-kept', 'game-not-decided', 'put-back-reason']) {
      expect(putBackProblemKey(code), code).toBe(`admin.boxScore.putBackError.${code}`);
      expect(en[putBackProblemKey(code)], code).not.toContain(code);
    }
    expect(putBackProblemKey('changed-since-read')).toBe('admin.games.error.changed-since-read');
    expect(putBackProblemKey('not-allowed')).toBe('admin.games.error.not-allowed');
  });
});
