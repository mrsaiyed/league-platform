// What the account button at the top right of every league page holds (U-8, step 2.127),
// worked out from what the league's gate already knows of the person: their admin areas
// here and whether they may score here; and, from their own teams of the season
// (team-pages, myTeamsOf), "My team" for anyone with a team (step 2.168). Nothing in it
// leads to a page not built yet.
//
// It is made for one request and drawn into that request's page only. League pages are
// drawn per request (they read the session cookie), and an answer that carries the
// signed-in form is never kept by a shared cache (T5 §4, T-95; the browser test checks
// both). When pages are kept for visitors, this moves to a small read after the page.
import { leagueUrl, platformUrl, type LeagueAddressee } from '@srleagues/core';
import type { LeagueView } from '../../server/league-gate.ts';
import { signInFirstUrl } from '../../server/sign-in-first.ts';
import { catalogs, en } from '@srleagues/site';
import { locale } from '../../server/messages.ts';
import { scoresOnly, waitingQuestionOf, type WaitingQuestion } from '../tracker/index.ts';

/** The account button of a signed-in person. */
export type AccountMenu = {
  /** One letter for the button, from the address until the account has a name (step 2.128). */
  readonly initial: string;
  /** The address the person is signed in with, said at the top of the menu. */
  readonly email: string;
  /** The admin's home, for someone with an area of the admin here who does more than score. */
  readonly adminHref: string | null;
  /** Their games to score, for someone who may score here. */
  readonly gamesHref: string | null;
  /**
   * Their team's page by way of `/{league}/my`, for someone with a team of the season here
   * (step 2.168); `several` when they have more than one, which `/my` then shows them.
   */
  readonly myTeam: { readonly href: string; readonly several: boolean } | null;
  readonly accountHref: string;
  /**
   * On the scoring page: "Sign out" leaves the open game first, as the tracker's own way
   * out does, and with scripts off is a link to the account page (tracker-sign-out.ts).
   */
  readonly onScoringPage: boolean;
};

/** The account button for the person `view` is for, or null for a visitor. */
export function accountMenuOf(
  view: LeagueView,
  email: string | null,
  path: string,
  /** How many teams of the season are the person's own here (myTeamsOf). */
  teams = 0,
): AccountMenu | null {
  if (view.context.account === null || email === null) return null;
  const league = view.context.league;
  const onlyScores = scoresOnly(view.areas);
  return {
    initial: initialOf(email),
    email,
    adminHref: view.areas.length > 0 && !onlyScores ? leagueUrl(league, 'admin') : null,
    // A scorekeeper's games are the admin's home for them (P4 §4); for staff who also
    // run other areas, the games area.
    gamesHref: !view.mayScore
      ? null
      : onlyScores
        ? leagueUrl(league, 'admin')
        : leagueUrl(league, 'admin-area', { area: 'games' }),
    myTeam: teams > 0 ? { href: leagueUrl(league, 'my'), several: teams > 1 } : null,
    accountHref: platformUrl('account'),
    onScoringPage: isScoringPage(league, path),
  };
}

const plain = (address: string): string => (address.split(/[?#]/)[0] ?? '').toLowerCase();

/** Whether `path` (the address as it arrived) is a game's scoring page in `league`. */
export function isScoringPage(league: LeagueAddressee, path: string): boolean {
  const sample = leagueUrl(league, 'score', { game: 'game' });
  const base = plain(sample.slice(0, sample.length - 'game'.length));
  const at = plain(path);
  return at.startsWith(base) && at.length > base.length;
}

/** The question asked before signing out with plays waiting, in the page's words. */
export function waitingQuestionWords(): WaitingQuestion {
  return waitingQuestionOf(locale, catalogs[locale] ?? en);
}

/** Where "Sign in or create an account" leads from the page at `path`: back to it after. */
export function signInHrefFrom(path: string): string {
  return signInFirstUrl(path);
}

function initialOf(email: string): string {
  const first = [...email.trim()][0] ?? '?';
  return first.toLocaleUpperCase('en');
}
