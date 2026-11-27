// What went wrong, and what happened, as the sign-in screens show it. A flow sends the
// browser back to its screen with `?problem=<name>` (and `&wait=<seconds>` when there is
// a wait), or on to a page with `?notice=<name>` when something was done ("You are signed
// out."); the screen turns the name into words from the message files (T-187). Names
// only, never anything the person typed, so an address bar holds nothing personal.
import type { PlatformPage } from '@srleagues/core';
import { platformUrl } from '@srleagues/core';
import type { TextKey } from '../messages.ts';

/** Every problem a sign-in screen can show, by name: its words. */
export const problems = {
  /** The bot check refused the form (T4 §6, record 081). */
  botCheckFailed: 'problem.botCheckFailed',
  /** The bot check could not be asked just now, or refused our key. */
  botCheckUnavailable: 'problem.botCheckUnavailable',
  /** The person's browser could not load the check (its box wrote botCheckDidNotLoad). */
  botCheckDidNotLoad: 'problem.botCheckDidNotLoad',
  /** Our server could not reach the check's service: asking for a code waits (Q2). */
  botCheckUnreachable: 'problem.botCheckUnreachable',
  invalidEmail: 'problem.invalidEmail',
  /** The test copy takes only a made-up address for a code (step 2.205). */
  onlyMadeUpAddresses: 'problem.onlyMadeUpAddresses',
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
  /** The test copy does not sign in with Google (step 2.205). */
  googleOff: 'problem.googleOff',
  signInAgain: 'problem.signInAgain',
  /** Sent from the tracker's address with no session (step 2.33). */
  signInToScore: 'problem.signInToScore',
  /** Sent from a game being scored whose sign-in ran out (step 2.33): the plays are kept. */
  backToYourGame: 'problem.backToYourGame',
  noPassword: 'problem.noPassword',
  signOutEverywhereFailed: 'problem.signOutEverywhereFailed',
} as const satisfies Record<string, TextKey>;

/** A pause for safety, with the wait in seconds (said in minutes): a plural message of its own. */
export type Problem = keyof typeof problems | 'tooManyAttempts';

/**
 * What was done, said on the page the person lands on (step 2.163). Each is true for as
 * long as the page shows it: a reload says the same, and nothing about the person rides
 * in the address. "Signed out" is said only to someone who is (the pages check).
 */
export const notices = {
  /** R-30: signing out leaves the person where they were, saying so. */
  signedOut: 'account.signedOutNotice',
  /** "Sign out everywhere" did what it says. */
  signedOutEverywhere: 'account.signedOutEverywhereNotice',
  /**
   * "Sign out everywhere" from a device whose session had already ended (M30): this
   * device is signed out, and nothing is claimed about the others.
   */
  alreadySignedOut: 'account.alreadySignedOutNotice',
  /** "Send a new code" sent one: the code screen words it with the address (M24). */
  codeSentAgain: 'code.sentAgain',
} as const satisfies Record<string, TextKey>;

export type Notice = keyof typeof notices;

/** Where to send the browser: one of our pages, a problem to show, and where to go after. */
export function screenUrl(
  page: PlatformPage,
  options: {
    readonly problem?: Problem;
    readonly wait?: number;
    readonly notice?: Notice;
    /** A question the page asks before doing something that cannot be undone. */
    readonly ask?: 'signOutEverywhere';
    readonly next?: string | null;
  } = {},
): string {
  const query = new URLSearchParams();
  if (options.ask !== undefined) query.set('ask', options.ask);
  if (options.problem !== undefined) query.set('problem', options.problem);
  if (options.wait !== undefined) query.set('wait', String(Math.max(1, Math.ceil(options.wait))));
  if (options.notice !== undefined) query.set('notice', options.notice);
  if (options.next !== undefined && options.next !== null) query.set('next', options.next);
  const text = query.toString();
  return text === '' ? platformUrl(page) : `${platformUrl(page)}?${text}`;
}

/**
 * `path` (a path on this site, already checked by safeReturnPath) with `notice` said on
 * it: its own query is kept, any notice it held is replaced, and its place (`#…`) stays.
 */
export function withNotice(path: string, notice: Notice): string {
  const site = 'http://site.invalid';
  const url = new URL(path, site);
  url.searchParams.set('notice', notice);
  return url.pathname + url.search + url.hash;
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

/** The notice a page was sent with, read back from its query; anything unknown is ignored. */
export function noticeOf(
  search: Readonly<Record<string, string | string[] | undefined>> | URLSearchParams,
): Notice | undefined {
  const name = search instanceof URLSearchParams ? search.get('notice') : search['notice'];
  return typeof name === 'string' && Object.hasOwn(notices, name) ? (name as Notice) : undefined;
}
