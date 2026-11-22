// The bot check's local stand-in (record 081): it passes only the answer its widget holds.
import { describe, expect, it } from 'vitest';
import {
  createLocalBotCheck,
  localBotCheckField,
  localBotCheckPassingAnswer,
} from './local-bot-check.ts';

const input = { action: 'sign-in', networkAddress: '192.0.2.10' } as const;

describe('createLocalBotCheck', () => {
  it('draws a hidden field holding the answer that passes, and passes it', async () => {
    const check = createLocalBotCheck({ appEnv: 'test' });
    expect(check.widget).toEqual({
      kind: 'stand-in',
      field: localBotCheckField,
      passingAnswer: localBotCheckPassingAnswer,
    });
    expect(await check.verify({ ...input, answer: localBotCheckPassingAnswer })).toEqual({
      passed: true,
    });
  });

  it('refuses a form with no answer, and any other answer', async () => {
    const check = createLocalBotCheck({ appEnv: 'local' });
    expect(await check.verify({ ...input, answer: '' })).toEqual({
      passed: false,
      refusal: 'missing',
    });
    for (const answer of ['wrong', `${localBotCheckPassingAnswer} `, 'LOCAL-BOT-CHECK-PASSED']) {
      expect(await check.verify({ ...input, answer })).toEqual({
        passed: false,
        refusal: 'failed',
      });
    }
  });

  it('can be told to refuse everything, for a test of a check that cannot be asked', async () => {
    const check = createLocalBotCheck({ appEnv: 'test', refuseEverything: 'unavailable' });
    expect(await check.verify({ ...input, answer: localBotCheckPassingAnswer })).toEqual({
      passed: false,
      refusal: 'unavailable',
    });
  });

  it('refuses to run anywhere but local work and tests', () => {
    for (const appEnv of ['staging', 'production', '']) {
      expect(() => createLocalBotCheck({ appEnv })).toThrow(/local work and tests only/);
    }
  });
});
