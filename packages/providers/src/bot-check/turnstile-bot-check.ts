// Cloudflare Turnstile (T4 §6, record 081), staging and production. Not verified against the
// live service: written from Turnstile's published API (the widget's script at
// challenges.cloudflare.com, and POST /turnstile/v0/siteverify with the secret key and the
// widget's answer) and tested only against made-up answers shaped like its own, never over
// the network.
//
// Beyond Turnstile's own "success", an answer passes only when Turnstile says it was made on
// our own site (`hostname`) for this very form (`action`), so an answer solved on another
// site, or on the sign-up form and replayed at sign-in, is refused. Turnstile itself refuses
// an answer used twice or older than five minutes. A refusal carries a fixed word, never
// Turnstile's own text, the answer, the address or the key (T-86); a problem that is ours to
// fix (our key refused, no answer from Turnstile) is also reported, in a fixed word.
import type { BotCheck, BotCheckRefusal, BotCheckVerdict } from './bot-check.ts';

/** What the web app is told about a check that is ours to put right: its kind only. */
export type TurnstileProblem = 'key-refused' | 'no-answer' | 'unexpected-answer';

export type TurnstileBotCheckOptions = {
  /** The widget's public key, drawn into the page. */
  readonly siteKey: string;
  /** The secret key: sent to Turnstile only, never anywhere else. */
  readonly secretKey: string;
  /** Our own site's host name (PUBLIC_BASE_URL): an answer made elsewhere is refused. */
  readonly siteHostname: string;
  /** Stand-in for tests; the real fetch otherwise. */
  readonly fetch?: typeof fetch;
  readonly verifyUrl?: string;
  /** How long to wait for Turnstile. Default 10 seconds. */
  readonly timeoutMs?: number;
  readonly onProblem?: (problem: TurnstileProblem) => void;
};

/** Where Turnstile's widget comes from. */
export const turnstileOrigin = 'https://challenges.cloudflare.com';

/** The field the widget writes its answer into, inside the form. */
export const turnstileField = 'cf-turnstile-response';

/** Turnstile's answers are at most this long; anything longer is not one. */
const longestAnswer = 2048;

/** The network Turnstile is told of: only a real address, never the shared unknown key. */
const unknownNetwork = '0.0.0.0';

export function createTurnstileBotCheck(options: TurnstileBotCheckOptions): BotCheck {
  const send = options.fetch ?? fetch;
  const url = options.verifyUrl ?? `${turnstileOrigin}/turnstile/v0/siteverify`;
  const expectedHost = options.siteHostname.toLowerCase();
  const refuse = (refusal: BotCheckRefusal, problem?: TurnstileProblem): BotCheckVerdict => {
    if (problem !== undefined) options.onProblem?.(problem);
    return { passed: false, refusal };
  };
  return {
    widget: {
      kind: 'turnstile',
      field: turnstileField,
      siteKey: options.siteKey,
      scriptUrl: `${turnstileOrigin}/turnstile/v0/api.js`,
      origin: turnstileOrigin,
    },
    verify: async ({ answer, action, networkAddress }) => {
      if (answer === '') return refuse('missing');
      if (answer.length > longestAnswer) return refuse('failed');
      let response: Response;
      try {
        response = await send(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: options.secretKey,
            response: answer,
            ...(networkAddress === unknownNetwork || networkAddress === ''
              ? {}
              : { remoteip: networkAddress }),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
      } catch {
        // Unreachable, or no answer in time. Its own error may name the address.
        return refuse('unavailable', 'no-answer');
      }
      if (!response.ok) return refuse('unavailable', 'unexpected-answer');
      const body: unknown = await response.json().catch(() => undefined);
      if (typeof body !== 'object' || body === null) {
        return refuse('unavailable', 'unexpected-answer');
      }
      const said = body as {
        readonly success?: unknown;
        readonly hostname?: unknown;
        readonly action?: unknown;
        readonly 'error-codes'?: unknown;
      };
      if (said.success === true) {
        const host = typeof said.hostname === 'string' ? said.hostname.toLowerCase() : '';
        return host === expectedHost && said.action === action
          ? { passed: true }
          : refuse('failed');
      }
      if (said.success !== false) return refuse('unavailable', 'unexpected-answer');
      const codes = Array.isArray(said['error-codes']) ? said['error-codes'] : [];
      if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret')) {
        return refuse('unavailable', 'key-refused');
      }
      if (codes.includes('internal-error')) return refuse('unavailable', 'no-answer');
      return refuse('failed');
    },
  };
}
