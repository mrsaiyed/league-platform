// The bot check (T4 §6, record 081): the interface, the local stand-in, Cloudflare
// Turnstile and which one an environment gets. Used only through the package's index.ts.
export type * from './bot-check.ts';
export { botCheckFor, type BotCheckSettings } from './bot-check-for.ts';
export {
  createLocalBotCheck,
  localBotCheckField,
  localBotCheckPassingAnswer,
  type LocalBotCheckOptions,
} from './local-bot-check.ts';
export {
  createTurnstileBotCheck,
  turnstileField,
  turnstileOrigin,
  type TurnstileBotCheckOptions,
  type TurnstileProblem,
} from './turnstile-bot-check.ts';
