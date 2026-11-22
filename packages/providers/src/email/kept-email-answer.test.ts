import { describe, expect, it } from 'vitest';
import { keptEmailAnswer } from './kept-email-answer.ts';

describe('keptEmailAnswer', () => {
  it('gives the code first, else the first link, else nothing', () => {
    expect(keptEmailAnswer('Your code is 482913. It works for 10 minutes.')).toEqual({
      kind: 'code',
      value: '482913',
    });
    expect(
      keptEmailAnswer('Join here: https://staging.example.test/i/abc-123. Or https://x.test/'),
    ).toEqual({ kind: 'link', value: 'https://staging.example.test/i/abc-123' });
    expect(keptEmailAnswer('Your password was changed on 2026-11-22.')).toBeNull();
    expect(keptEmailAnswer('A number 1234567 is not a code.')).toBeNull();
  });
});
