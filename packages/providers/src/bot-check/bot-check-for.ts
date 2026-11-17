// Which bot check an environment gets (record 081), as emailSenderFor picks an email sender:
// local work and tests get the stand-in, whatever keys they are given, so a test never asks
// Cloudflare; production gets Turnstile and needs both of its keys; staging gets Turnstile
// with both keys and the check switched off with neither (T-270), and is refused with one.
import { createBotCheckOff } from './bot-check-off.ts';
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

/** Why botCheckFor refused, in fixed words naming settings only, never a value. */
export class BotCheckSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotCheckSettingsError';
  }
}

export function botCheckFor(settings: BotCheckSettings): BotCheck {
  if (settings.appEnv === 'local' || settings.appEnv === 'test') {
    return createLocalBotCheck({ appEnv: settings.appEnv });
  }
  const siteKey = settings.turnstileSiteKey?.trim() ?? '';
  const secretKey = settings.turnstileSecretKey?.trim() ?? '';
  // Staging with neither key: the check is off (T-270). With one of the two it is a mistake.
  if (settings.appEnv === 'staging' && siteKey === '' && secretKey === '') {
    return createBotCheckOff();
  }
  const missing = [
    ...(siteKey === '' ? ['TURNSTILE_SITE_KEY'] : []),
    ...(secretKey === '' ? ['TURNSTILE_SECRET_KEY'] : []),
  ];
  if (missing.length > 0) {
    throw new BotCheckSettingsError(
      settings.appEnv === 'production'
        ? `botCheckFor: production needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.`
        : `botCheckFor: staging has one of Turnstile's two keys: ${missing.join(' and ')} is missing (give both, or neither to switch the bot check off).`,
    );
  }
  return createTurnstileBotCheck({
    siteKey,
    secretKey,
    siteHostname: settings.siteHostname,
    ...(settings.onProblem === undefined ? {} : { onProblem: settings.onProblem }),
  });
}
