// T-70: with no time limit on a session, the few dangerous actions (exporting
// everyone's data, deleting for good, roles and ownership, payout details) ask for
// the password again when it was last typed over an hour ago. An account with no
// password (made with Google) proves itself by a Google sign-in in the last hour.
// The pages of those actions (later steps) call passwordAgainAddress first.
import type { SignedInAccount } from '../context.ts';
import { screenUrl } from './problems.ts';

export const passwordAgainAfterMinutes = 60;

/** Whether this session must prove itself again before a sensitive action. */
export function needsPasswordAgain(account: SignedInAccount, now: Date): boolean {
  const proved = account.hasPassword ? account.passwordEnteredAt : account.lastSignInAt;
  if (proved === null) return true;
  return now.getTime() - proved.getTime() > passwordAgainAfterMinutes * 60_000;
}

/** Where to send the person first, coming back to `next` after; null when nothing is needed. */
export function passwordAgainAddress(
  account: SignedInAccount,
  next: string,
  now: Date,
): string | null {
  return needsPasswordAgain(account, now) ? screenUrl('confirmPassword', { next }) : null;
}
