// Where someone is sent to sign in from a page that brings them back afterwards (the
// tracker, the scorekeeper's games, step 2.33): the sign-in screen, with the page's own
// address as the place to return to. The return address goes through the sign-in
// screen's own check (safeReturnPath), so only a path on this site is ever kept.
import { safeReturnPath } from './sign-in/device.ts';
import { screenUrl, type Problem } from './sign-in/problems.ts';

/** The sign-in screen, to come back to `returnTo`, with `problem` shown on it if given. */
export function signInFirstUrl(
  returnTo: string,
  options: { readonly problem?: Problem } = {},
): string {
  const next = safeReturnPath(returnTo);
  return screenUrl('signin', {
    next,
    ...(options.problem === undefined ? {} : { problem: options.problem }),
  });
}
