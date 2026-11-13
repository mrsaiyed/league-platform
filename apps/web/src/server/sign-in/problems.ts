// What went wrong, as the sign-in screens show it. A flow sends the browser back to
// its screen with `?problem=<name>` (and `&wait=<seconds>` when there is a wait);
// the screen turns the name into words from the message files (T-187). Names only,
// never anything the person typed, so an address bar holds nothing personal.
import type { PlatformPage } from '@srleagues/core';
import { platformUrl } from '@srleagues/core';
import type { TextKey } from '../messages.ts';

/** Every problem a sign-in screen can show, by name: its words. */
export const problems = {
  invalidEmail: 'problem.invalidEmail',
  codeUsedUp: 'problem.codeUsedUp',
  codeNotSent: 'problem.codeNotSent',
  codeWrong: 'problem.codeWrong',
  codeExpired: 'problem.codeExpired',
  proofInvalid: 'problem.proofInvalid',
  passwordTooShort: 'problem.passwordTooShort',
  passwordTooLong: 'problem.passwordTooLong',
  passwordLeaked: 'problem.passwordLeaked',
  wrongEmailOrPassword: 'problem.wrongEmailOrPassword',
  wrongPassword: 'problem.wrongPassword',
  googleFailed: 'problem.googleFailed',
  signInAgain: 'problem.signInAgain',
  noPassword: 'problem.noPassword',
} as const satisfies Record<string, TextKey>;

/** "Too many tries", with the wait in seconds: a plural message of its own. */
export type Problem = keyof typeof problems | 'tooManyAttempts';

/** Where to send the browser: one of our pages, a problem to show, and where to go after. */
export function screenUrl(
  page: PlatformPage,
  options: {
    readonly problem?: Problem;
    readonly wait?: number;
    readonly next?: string | null;
  } = {},
): string {
  const query = new URLSearchParams();
  if (options.problem !== undefined) query.set('problem', options.problem);
  if (options.wait !== undefined) query.set('wait', String(Math.max(1, Math.ceil(options.wait))));
  if (options.next !== undefined && options.next !== null) query.set('next', options.next);
  const text = query.toString();
  return text === '' ? platformUrl(page) : `${platformUrl(page)}?${text}`;
}

/** The problem a screen was sent with, read back; anything unknown is ignored. */
export function problemOf(
  search: Readonly<Record<string, string | string[] | undefined>>,
): { readonly name: Problem; readonly wait: number } | undefined {
  const name = search['problem'];
  if (typeof name !== 'string') return undefined;
  const waitText = search['wait'];
  const wait = typeof waitText === 'string' && /^\d{1,6}$/.test(waitText) ? Number(waitText) : 0;
  if (name === 'tooManyAttempts') return { name, wait: Math.max(1, wait) };
  return Object.hasOwn(problems, name) ? { name: name as keyof typeof problems, wait } : undefined;
}
