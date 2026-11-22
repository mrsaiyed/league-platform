import { describe, expect, it } from 'vitest';
import { keptEmailAnswer } from './kept-email-answer.ts';

describe('keptEmailAnswer', () => {
  it('gives a code email its code, any other its first link, else nothing', () => {
    expect(
      keptEmailAnswer({ kind: 'code', text: 'Your code is 482913. It works for 10 minutes.' }),
    ).toEqual({ kind: 'code', value: '482913' });
    expect(
      keptEmailAnswer({
        kind: 'link',
        text: 'Join here: https://staging.example.test/i/abc-123. Or https://x.test/',
      }),
    ).toEqual({ kind: 'link', value: 'https://staging.example.test/i/abc-123' });
    expect(
      keptEmailAnswer({ kind: 'link', text: 'Your password was changed on 2026-11-22.' }),
    ).toBeNull();
    expect(keptEmailAnswer({ kind: 'code', text: 'A number 1234567 is not a code.' })).toBeNull();
  });

  it('gives an invitation its link, though its league’s name holds six digits', () => {
    const text =
      'You are invited to join Class of 202526 on SR Leagues.\n' +
      'Accept: https://staging.example.test/invite/made-up-token\n';
    expect(keptEmailAnswer({ kind: 'link', text })).toEqual({
      kind: 'link',
      value: 'https://staging.example.test/invite/made-up-token',
    });
  });
});
