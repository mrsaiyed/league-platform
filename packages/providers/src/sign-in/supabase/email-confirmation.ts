// "Does Supabase confirm email addresses before a sign-in counts?" (step 2.115).
//
// Supabase's "Confirm email" switch is answered in the project's public settings
// (`GET /auth/v1/settings`) as `mailer_autoconfirm`: false when addresses must be
// confirmed, true when Supabase takes any address typed at its own sign-up as proved.
// That answer needs only the key the app already holds; no admin call reads more.
// NOT VERIFIED AGAINST THE LIVE SERVICE: the shape follows Supabase Auth's published
// settings answer and is tested against handwritten answers only (record 018).
//
// Only a plain `false` is `on`. A `true` is `off`. Anything else (no such field, not a
// yes or no, a refusal, Supabase down, no answer in time) is `unknown`, never `on`.
// Nothing here is logged, and nothing returned names a key, an address or a person.
import type { EmailConfirmation, EmailConfirmationQuestion } from '../sign-in-service.ts';
import {
  checkProjectUrl,
  createGoTrueClient,
  type FetchLike,
  type GoTrueClient,
  type StartTimer,
} from './gotrue-client.ts';

/** Supabase's answer to `GET /settings`, read as one of the three answers. */
export async function emailConfirmationOf(
  auth: Pick<GoTrueClient, 'settings'>,
): Promise<EmailConfirmation> {
  let answer;
  try {
    answer = await auth.settings();
  } catch {
    return 'unknown';
  }
  if (!answer.ok) return 'unknown';
  const body = answer.value;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'unknown';
  const autoconfirm: unknown = (body as Record<string, unknown>)['mailer_autoconfirm'];
  if (autoconfirm === false) return 'on';
  if (autoconfirm === true) return 'off';
  return 'unknown';
}

export type SupabaseEmailConfirmationOptions = {
  /** The project's address, from the app's config (T-30). */
  readonly projectUrl: string;
  /** The project's secret (server) key, from the app's config, never written in code (T-30). */
  readonly secretKey: string;
  readonly fetch: FetchLike;
  /** The time limit on the call, and its timer (`gotrue-client.ts`). */
  readonly callTimeoutMs?: number;
  readonly startTimer?: StartTimer;
};

/**
 * The question alone, for start-up before the whole adapter is built (step 2.93's last
 * part builds it; the adapter's own `emailConfirmation` asks the same).
 */
export function createSupabaseEmailConfirmation(
  options: SupabaseEmailConfirmationOptions,
): EmailConfirmationQuestion {
  checkProjectUrl(options.projectUrl, false);
  if (!options.secretKey) throw new Error('The Supabase secret key is missing.');
  const auth = createGoTrueClient({
    projectUrl: options.projectUrl,
    secretKey: options.secretKey,
    fetch: options.fetch,
    ...(options.callTimeoutMs === undefined ? {} : { timeoutMs: options.callTimeoutMs }),
    ...(options.startTimer === undefined ? {} : { startTimer: options.startTimer }),
  });
  return { emailConfirmation: () => emailConfirmationOf(auth) };
}
