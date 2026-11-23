import { describe, expect, it } from 'vitest';
import { botCheckDidNotLoad } from './bot-check.ts';
import {
  createMadeUpTurnstileBotCheck,
  madeUpTurnstileAnswer,
  madeUpTurnstileOrigin,
} from './made-up-turnstile-bot-check.ts';

describe('createMadeUpTurnstileBotCheck', () => {
  it('draws Turnstile’s box in explicit mode from an address that cannot exist', () => {
    const { widget } = createMadeUpTurnstileBotCheck({ appEnv: 'test' });
    expect(widget).toMatchObject({ kind: 'turnstile', origin: madeUpTurnstileOrigin });
    expect(new URL(madeUpTurnstileOrigin).hostname.endsWith('.invalid')).toBe(true);
    expect(widget.kind === 'turnstile' ? widget.scriptUrl : '').toContain('render=explicit');
  });

  it('passes each answer once, for the form it was made for only', async () => {
    const check = createMadeUpTurnstileBotCheck({ appEnv: 'test' });
    const answer = madeUpTurnstileAnswer('sign-in', 'a1');
    expect(await check.verify({ answer, action: 'sign-in' })).toEqual({ passed: true });
    expect(await check.verify({ answer, action: 'sign-in' })).toEqual({
      passed: false,
      refusal: 'failed',
    });
    expect(
      await check.verify({ answer: madeUpTurnstileAnswer('sign-up', 'a2'), action: 'reset' }),
    ).toEqual({ passed: false, refusal: 'failed' });
    expect(await check.verify({ answer: 'made-up-answer', action: 'reset' })).toEqual({
      passed: false,
      refusal: 'failed',
    });
  });

  it('refuses no answer as missing, and the box’s fixed word as did-not-load', async () => {
    const check = createMadeUpTurnstileBotCheck({ appEnv: 'local' });
    expect(await check.verify({ answer: '', action: 'sign-up' })).toEqual({
      passed: false,
      refusal: 'missing',
    });
    expect(await check.verify({ answer: botCheckDidNotLoad, action: 'sign-up' })).toEqual({
      passed: false,
      refusal: 'did-not-load',
    });
  });

  it('refuses to run anywhere but local work and tests', () => {
    expect(() => createMadeUpTurnstileBotCheck({ appEnv: 'staging' })).toThrow();
    expect(() => createMadeUpTurnstileBotCheck({ appEnv: 'production' })).toThrow();
  });
});
