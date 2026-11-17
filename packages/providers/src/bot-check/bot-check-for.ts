// Which bot check an environment gets (record 081), as emailSenderFor picks an email sender:
// local work and tests get the stand-in, whatever keys they are given, so a test never asks
// Cloudflare; staging and production get Turnstile and need both of its keys.
import type { BotCheck } from './bot-check.ts';
import { createLocalBotCheck } from './local-bot-check.ts';
import { createTurnstileBotCheck, type TurnstileProblem } from './turnstile-bot-check.ts';

export type BotCheckSettings = {
  readonly appEnv: 'local' | 'test' | 'staging' | 'production';
  /** Our own site's host name: Turnstile's answer must have been made there. */
  readonly siteHostname: string;
  /** Used only in staging and production. */
  readonly turnstileSiteKey?: string | undefined;
  readonly turnstileSecretKey?: string | undefined;
  readonly onProblem?: (problem: TurnstileProblem) => void;
};

export function botCheckFor(settings: BotCheckSettings): BotCheck {
  if (settings.appEnv === 'local' || settings.appEnv === 'test') {
    return createLocalBotCheck({ appEnv: settings.appEnv });
  }
  const siteKey = settings.turnstileSiteKey?.trim() ?? '';
  const secretKey = settings.turnstileSecretKey?.trim() ?? '';
  if (siteKey === '' || secretKey === '') {
    throw new Error(
      `botCheckFor: ${settings.appEnv} needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.`,
    );
  }
  return createTurnstileBotCheck({
    siteKey,
    secretKey,
    siteHostname: settings.siteHostname,
    ...(settings.onProblem === undefined ? {} : { onProblem: settings.onProblem }),
  });
}
