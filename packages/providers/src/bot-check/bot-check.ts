// The bot check in front of sign-in and sign-up (T4 §6, record 081): the interface every
// adapter keeps, so the web app never names a vendor. A page draws the check's widget in
// its form (`widget`), the browser sends what the widget answered in the form's field
// `widget.field`, and the server asks the check about it (`verify`) before the sign-in
// service hears of the request at all.
//
// Adapters: the local stand-in (local work and tests, local-bot-check.ts), Cloudflare
// Turnstile (production, and staging when given its keys, turnstile-bot-check.ts), and the
// check switched off (staging without Turnstile's keys only, bot-check-off.ts); botCheckFor
// picks one.

/** Which form the check is in front of; Turnstile's answer must name the same one. */
export type BotCheckAction = 'reset' | 'sign-in' | 'sign-up';

/** What a page draws inside the form, and the field its answer comes back in. */
export type BotCheckWidget =
  | {
      /** The local stand-in: a hidden field holding the answer that passes. */
      readonly kind: 'stand-in';
      readonly field: string;
      readonly passingAnswer: string;
    }
  | {
      /**
       * No check (staging without Turnstile's keys, T-270): the page draws nothing and every
       * form passes. `field` is named only so a form reads one; nothing is put in it.
       */
      readonly kind: 'off';
      readonly field: string;
    }
  | {
      /** Cloudflare Turnstile: its script and frame, from its one origin. */
      readonly kind: 'turnstile';
      readonly field: string;
      readonly siteKey: string;
      readonly scriptUrl: string;
      /** Where the widget's script and frame come from: the page's script policy allows it. */
      readonly origin: string;
    };

/**
 * Why a check did not pass, in fixed words: `missing` (no answer came with the form: no
 * script ran, or a bot posted the form itself), `failed` (an answer that is wrong, made for
 * another form or another site, used already or too old), `unavailable` (the check itself
 * could not be asked, or refused our key). Every one refuses the request.
 */
export type BotCheckRefusal = 'failed' | 'missing' | 'unavailable';

export type BotCheckVerdict =
  | { readonly passed: true }
  | { readonly passed: false; readonly refusal: BotCheckRefusal };

export type BotCheckInput = {
  /** What the widget answered: the form's `widget.field`, '' when none came. */
  readonly answer: string;
  readonly action: BotCheckAction;
  /** The visitor's network (networkAddressOf), passed on only when it is a real address. */
  readonly networkAddress: string;
};

export type BotCheck = {
  readonly widget: BotCheckWidget;
  /** Never throws: anything that goes wrong is a refusal. */
  readonly verify: (input: BotCheckInput) => Promise<BotCheckVerdict>;
};
