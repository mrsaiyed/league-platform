// The bot check switched off (record 081): for staging only, when Turnstile's two keys are
// not given (T-270: the first online test copy has no Cloudflare account, and holds made-up
// people only). Nothing is drawn and every form passes; start-up says so in one line.
// Production never gets it (botCheckFor refuses there without both keys).
import type { BotCheck } from './bot-check.ts';
import { turnstileField } from './turnstile-bot-check.ts';

export function createBotCheckOff(): BotCheck {
  return {
    widget: { kind: 'off', field: turnstileField },
    verify: async () => ({ passed: true }),
  };
}
