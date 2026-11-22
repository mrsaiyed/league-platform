// The bot check's local stand-in (record 081), for local work and tests only: no vendor is
// asked. Its widget is a hidden field holding the one answer that passes, drawn by the page
// as a real widget is, so a person's browser (or a browser test) passes it by sending the
// form as it was drawn, and a form posted without the field, or with any other answer, is
// refused as the real check would refuse it. It keeps nothing about anyone.
import { botCheckDidNotLoad, type BotCheck, type BotCheckRefusal } from './bot-check.ts';

/** The field the stand-in's answer comes back in: Turnstile's own name, so forms are alike. */
export const localBotCheckField = 'cf-turnstile-response';

/** The one answer the stand-in passes. Made up; it means nothing anywhere else. */
export const localBotCheckPassingAnswer = 'local-bot-check-passed';

export type LocalBotCheckOptions = {
  /** Where it runs: anything but local work and tests is refused. */
  readonly appEnv: string;
  /**
   * For a test of what the web app does when the check cannot be asked: every answer is
   * then refused with this. Left out, the stand-in answers as described above.
   */
  readonly refuseEverything?: BotCheckRefusal;
};

export function createLocalBotCheck(options: LocalBotCheckOptions): BotCheck {
  if (options.appEnv !== 'local' && options.appEnv !== 'test') {
    throw new Error('The local bot check is for local work and tests only.');
  }
  return {
    widget: {
      kind: 'stand-in',
      field: localBotCheckField,
      passingAnswer: localBotCheckPassingAnswer,
    },
    verify: async ({ answer }) => {
      if (options.refuseEverything !== undefined) {
        return { passed: false, refusal: options.refuseEverything };
      }
      if (answer === '') return { passed: false, refusal: 'missing' };
      if (answer === botCheckDidNotLoad) return { passed: false, refusal: 'did-not-load' };
      if (answer !== localBotCheckPassingAnswer) return { passed: false, refusal: 'failed' };
      return { passed: true };
    },
  };
}
