// THE LOCAL-ONLY TOOLS (step 2.96): the kept emails' page and "be this made-up person".
// FOR LOCAL WORK AND TESTS ONLY. In staging and production both pages, and the form's
// action, answer "not found", as an address that does not exist.
//
// Three locks, all on the server. What a request carries can only take the tools away,
// never give them: no header, cookie or address turns them on.
// 1. The app's mode: APP_ENV local or test, by the same test that chooses the made-up
//    stand-in at startup (runsOnMadeUpData, made-up-mode.ts). It is asked first, before
//    the app's ports are even asked for, so in staging and production nothing else runs.
// 2. The request: only one made on this computer, by the proxy's own test (answersOnlyHere,
//    this-computer.ts: addressed to this computer's names, or the app's own `.test` name,
//    and not passed on by another server). It is asked here, whatever the ports say, so the
//    pages and the action refuse a request from another computer even if a later port
//    forgets to.
// 3. The ports: only the ports made on made-up data carry the tools (the stand-in's, and
//    the made-up database's, both built on the sign-in stand-in, which refuses to be made
//    outside local and test or for a site address that is not this computer or a test
//    name), and ports that carry them answer only requests made on this computer (the
//    proxy refuses any other before a page is drawn). The ports of a real database carry
//    none.
import type { LeagueMembership } from '@srleagues/core';
import type { KeptEmail } from './kept-emails.ts';
import { runsOnMadeUpData } from './made-up-mode.ts';
import { answersOnlyHere } from './this-computer.ts';

/** A league a made-up person belongs to, and what they are there. */
export type MadeUpPlace = {
  readonly slug: string;
  readonly name: string;
  /** Owner first, then each role, then "on a team" (core's order, myLeagues). */
  readonly memberships: readonly LeagueMembership[];
};

/** One made-up person the browser can be signed in as, and what they are where. */
export type MadeUpChoice = {
  /** Which made-up person: what the form sends; how they sign in stays on the server. */
  readonly key: string;
  readonly name: string;
  readonly email: string;
  readonly places: readonly MadeUpPlace[];
};

/**
 * How a made-up person is signed in, read on the server by the choice's key: on the
 * stand-in with the made-up password the stand-in gave them at startup; on the made-up
 * database with an emailed code, as anyone signs up (no password is given to anyone).
 */
export type MadeUpSignIn =
  | { readonly kind: 'password'; readonly email: string; readonly password: string }
  | { readonly kind: 'code'; readonly email: string };

export type LocalTools = {
  /** The newest kept emails, newest first (kept-emails.ts). */
  readonly keptEmails: () => Promise<readonly KeptEmail[]>;
  /** The made-up people who can be chosen, with the leagues each belongs to. */
  readonly madeUpPeople: () => Promise<readonly MadeUpChoice[]>;
  /** How the made-up person of this key signs in; undefined for any other key. */
  readonly madeUpSignInOf: (key: string) => MadeUpSignIn | undefined;
  /** The code of the newest email captured for `email` (in memory, never a file). */
  readonly newestCodeFor: (email: string) => Promise<string | undefined>;
};

/** The app's own settings the gate reads: APP_ENV and PUBLIC_BASE_URL. */
export type LocalToolsSettings = {
  readonly appEnv: string;
  readonly publicBaseUrl: string;
};

/**
 * The local tools, or undefined when they must answer "not found": in any mode but local
 * and test, for a request not made on this computer (both decided before `ports` is
 * called), or when the ports carry none.
 */
export async function localToolsOf(
  settings: LocalToolsSettings,
  request: Headers,
  ports: () => Promise<{ readonly localTools: LocalTools | null }>,
): Promise<LocalTools | undefined> {
  if (!runsOnMadeUpData(settings.appEnv)) return undefined;
  if (!answersOnlyHere(settings.publicBaseUrl)(request)) return undefined;
  return (await ports()).localTools ?? undefined;
}
