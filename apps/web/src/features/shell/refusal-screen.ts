// What "You do not have access" says, and where it leads, for the person who is looking
// (step 2.157; U-6, U-15; finding H3 of the 2.106 audit). Worked out on the server from the
// session alone: who is signed in, and what the league's gate already knows they hold in
// this league (league-gate.ts). The address chooses only where the screen is drawn (inside
// the admin's frame, for an admin address of someone the admin is open to) and where
// "Use another account" brings them back to; it never chooses the words.
//
// What it may say (U-9): the league is named only when the gate says it may be shown to
// this person, and then only its own public name and home. A league that may not be shown
// is never refused here at all: the gate answers "not found" for it, exactly as for a
// league that does not exist. A member of staff learns only that their own role does not
// include this page, never which roles or areas would; nobody else learns any more than
// that their account does not help run the league.
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';
import type { LeagueView } from '../../server/league-gate.ts';
import { signInFirstUrl } from '../../server/sign-in-first.ts';
import type { TextKey } from '../../server/messages.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';

type WayOn = { readonly href: string; readonly label: TextKey; readonly league?: string };

export type RefusalScreen = {
  /** Who it is for (the unit test reads it). */
  readonly kind: 'visitor' | 'staff' | 'outsider' | 'no-league';
  /** The sentences, in order. */
  readonly says: readonly TextKey[];
  /** The address the person is signed in with, said on the screen; null for a visitor. */
  readonly email: string | null;
  /** The one clear way on. */
  readonly action: WayOn;
  /** Quieter ways on, under it. */
  readonly also: readonly WayOn[];
};

/** Where an outsider's "Back to {league}" leads: the league's home as a visitor sees it. */
const homeOf = (league: LeagueAddressee) => leagueHomeStayUrl(league);

/**
 * The refusal for this person. `view` is the league's public view when the league may be
 * shown to them (null otherwise, or when the refused address is no league's); `leagueName`
 * its public name; `path` the refused address, for the way back after signing in again.
 */
export function refusalScreenOf(input: {
  readonly email: string | null;
  readonly view: LeagueView | null;
  readonly leagueName: string | null;
  readonly path: string;
}): RefusalScreen {
  const { email, view, leagueName, path } = input;
  const switchTo: WayOn = { href: signInFirstUrl(path), label: 'access.noAccess.switch' };
  if (email === null || view?.context.account === null) {
    return {
      kind: 'visitor',
      says: ['access.noAccess.body'],
      email: null,
      action: { href: signInFirstUrl(path), label: 'nav.signIn' },
      also: [],
    };
  }
  if (view === null || leagueName === null) {
    return {
      kind: 'no-league',
      says: ['access.noAccess.notStaff', 'access.noAccess.signedInAs'],
      email,
      action: switchTo,
      also: [],
    };
  }
  const league = view.context.league;
  const backToLeague: WayOn = {
    href: homeOf(league),
    label: 'access.noAccess.backToLeague',
    league: leagueName,
  };
  if (view.runsTheLeague) {
    return {
      kind: 'staff',
      says: ['access.noAccess.notYourRole', 'access.noAccess.signedInAs'],
      email,
      action: { href: leagueUrl(league, 'admin'), label: 'admin.backToAdmin' },
      also: [backToLeague, switchTo],
    };
  }
  return {
    kind: 'outsider',
    says: ['access.noAccess.notStaff', 'access.noAccess.signedInAs'],
    email,
    action: backToLeague,
    also: [switchTo],
  };
}
