// Where the accept page's "Accept" button sends someone it does not accept for (step
// 2.223, T-453): back to the accept page, which says why, or to the platform's home.
// A league hidden from the person (a draft or suspended one, U-9) sends a visitor, and
// anyone signed in who holds no invitation for it, to the home page: the same place a
// league that does not exist sends them, so the two cannot be told apart. A signed-in
// person holding an invitation came from the emailed link and goes back to read why.
import { mayOpenLeague, platformUrl, type AccessHolder } from '@srleagues/core';

export function turnedBackTo(input: {
  readonly status: Parameters<typeof mayOpenLeague>[0];
  /** What the account holds in the league; undefined for a visitor or a stranger. */
  readonly holder: AccessHolder | undefined;
  readonly signedIn: boolean;
  readonly invitationHeld: boolean;
  /** The accept page of the invitation held for this league, if any. */
  readonly back: string | null;
}): string {
  const home = platformUrl('home');
  const hidden = !mayOpenLeague(input.status, input.holder);
  if (hidden && !(input.signedIn && input.invitationHeld)) return home;
  return input.back ?? home;
}
