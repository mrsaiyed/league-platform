// A made-up Turnstile (record 081, step 2.98's fix round), for local work and tests only: the
// page draws Turnstile's own box in explicit mode, exactly as with the real service, but its
// script comes from an address that does not exist (`.invalid` never resolves), so nothing
// can leave the computer; a browser test serves its own made-up copy of that script there.
// The made-up script answers `made-up-answer:{action}:{a fresh id}`; the server passes each
// such answer once, for the form it was made for, as the real service does. Nothing is kept
// but the answers already used, for as long as the server runs.
import {
  botCheckDidNotLoad,
  type BotCheck,
  type BotCheckAction,
  type BotCheckVerdict,
} from './bot-check.ts';
import { localBotCheckField } from './local-bot-check.ts';

/** Where the made-up Turnstile's script would come from: an address that cannot exist. */
export const madeUpTurnstileOrigin = 'https://bot-check.made-up.invalid';

/** The made-up public key drawn into the page. Not a key of any service. */
export const madeUpTurnstileSiteKey = 'made-up-site-key';

/** An answer the made-up script gives for this form, with a fresh id. */
export const madeUpTurnstileAnswer = (action: BotCheckAction, id: string): string =>
  `made-up-answer:${action}:${id}`;

const answerShape = /^made-up-answer:(sign-in|sign-up|reset):([A-Za-z0-9-]{1,64})$/;

export function createMadeUpTurnstileBotCheck(options: { readonly appEnv: string }): BotCheck {
  if (options.appEnv !== 'local' && options.appEnv !== 'test') {
    throw new Error('The made-up Turnstile is for local work and tests only.');
  }
  const used = new Set<string>();
  const refuse = (refusal: 'did-not-load' | 'failed' | 'missing'): BotCheckVerdict => ({
    passed: false,
    refusal,
  });
  return {
    widget: {
      kind: 'turnstile',
      field: localBotCheckField,
      siteKey: madeUpTurnstileSiteKey,
      scriptUrl: `${madeUpTurnstileOrigin}/turnstile/v0/api.js?render=explicit`,
      origin: madeUpTurnstileOrigin,
    },
    verify: async ({ answer, action }) => {
      if (answer === '') return refuse('missing');
      if (answer === botCheckDidNotLoad) return refuse('did-not-load');
      const shape = answerShape.exec(answer);
      if (shape === null || shape[1] !== action || used.has(answer)) return refuse('failed');
      used.add(answer);
      return { passed: true };
    },
  };
}
