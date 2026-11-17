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
// league that does not exist. A member of staff is told their own roles in this league
// (nothing they do not hold) and that those do not include this page, never which roles or
// areas would; anyone else is told only that the page is for the people who run the league.
import { leagueUrl, type LeagueAddressee, type Role } from '@srleagues/core';
import type { LeagueView } from '../../server/league-gate.ts';
import { signInFirstUrl } from '../../server/sign-in-first.ts';
import type { TextKey } from '../../server/messages.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';

type WayOn = { readonly href: string; readonly label: TextKey; readonly league?: string };

/** One sentence: its key, and the league's name or the person's own roles it names. */
export type Saying = {
  readonly key: TextKey;
  readonly league?: string;
  readonly roles?: readonly Role[];
};

export type RefusalScreen = {
  /** Who it is for (the unit test reads it). */
  readonly kind: 'visitor' | 'staff' | 'outsider' | 'no-league';
  /** The sentences, in order. */
  readonly says: readonly Saying[];
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
 * its public name (null when it could not be read: its short name is used); `path` the
 * refused address, for the way back after signing in again; `roles` the roles this person
 * holds in this league (their own, as the gate read them), named to staff.
 */
export function refusalScreenOf(input: {
  readonly email: string | null;
  readonly view: LeagueView | null;
  readonly leagueName: string | null;
  readonly path: string;
  readonly roles?: readonly Role[];
}): RefusalScreen {
  const { email, view, leagueName, path, roles = [] } = input;
  const signedInAs: Saying = { key: 'access.noAccess.signedInAs' };
  const switchTo: WayOn = { href: signInFirstUrl(path), label: 'access.noAccess.switch' };
  if (email === null || view?.context.account === null) {
    return {
      kind: 'visitor',
      says: [{ key: 'access.noAccess.body' }],
      email: null,
      action: { href: signInFirstUrl(path), label: 'nav.signIn' },
      also: [],
    };
  }
  if (view === null) {
    return {
      kind: 'no-league',
      says: [signedInAs],
      email,
      action: switchTo,
      also: [],
    };
  }
  const league = view.context.league;
  // Who they are is the view's alone; a name that could not be read is the league's short
  // name, as its own pages show it then (league-site.ts).
  const name = leagueName ?? league.slug;
  const backToLeague: WayOn = {
    href: homeOf(league),
    label: 'access.noAccess.backToLeague',
    league: name,
  };
  if (view.runsTheLeague) {
    return {
      kind: 'staff',
      says: [
        ...(roles.length > 0 ? [{ key: 'access.noAccess.youAre', roles } as const] : []),
        { key: 'access.noAccess.notYourRole' },
        signedInAs,
      ],
      email,
      action: { href: leagueUrl(league, 'admin'), label: 'admin.backToAdmin' },
      also: [backToLeague, switchTo],
    };
  }
  return {
    kind: 'outsider',
    says: [{ key: 'access.noAccess.notStaff', league: name }, signedInAs],
    email,
    action: backToLeague,
    also: [switchTo],
  };
}
