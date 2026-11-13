import { describe, expect, it } from 'vitest';
import { createSignInCodeCapture } from './code-capture.ts';

const at = new Date(Date.UTC(2026, 10, 13, 12));

describe('the sign-in code capture', () => {
  it('keeps every message, and finds the newest code per address', async () => {
    const capture = createSignInCodeCapture();
    const send = (to: string, code: string | null) =>
      capture.sender.send({
        to,
        purpose: 'reset',
        code,
        accountExists: code !== null,
        expiresAt: at,
      });
    expect(await send('ana@example.test', '111111')).toEqual({ ok: true, value: { queued: true } });
    await send('ben@example.test', '222222');
    await send('ana@example.test', '333333');
    await send('ana@example.test', null);
    expect(capture.messages()).toHaveLength(4);
    expect(capture.latestCodeFor(' Ana@Example.test ')).toBe('333333');
    expect(capture.latestCodeFor('cara@example.test')).toBeUndefined();
  });

  it('hands out copies and empties on request', async () => {
    const capture = createSignInCodeCapture();
    await capture.sender.send({
      to: 'ana@example.test',
      purpose: 'sign-up',
      code: '123456',
      accountExists: false,
      expiresAt: at,
    });
    const before = capture.messages();
    capture.clear();
    expect(before).toHaveLength(1);
    expect(capture.messages()).toEqual([]);
    expect(capture.latestCodeFor('ana@example.test')).toBeUndefined();
  });
});
