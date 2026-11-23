// Signing out while a game is open on the device (step 2.127; T6 §5, T-115). The account
// button's "Sign out" is on the scoring page too, and must leave the game as the
// tracker's own ways out do: release the scoring session first, so the next person on
// the same tablet is not told someone is "scoring this game on another device"; ask
// first when plays are still waiting to be sent, and keep the game on the device then,
// since those plays are sent once the scorekeeper signs in again.
//
// The open tracker page registers how it leaves (holdSignOut); every sign-out form asks
// beforeSignOut what to do. With no game open there is nothing to ask or release.
import { translatorFrom, type Catalog } from '@srleagues/site';

/** What the open tracker page offers a sign-out: its waiting plays, and leaving the game. */
export type TrackerSignOutHold = {
  /** Plays stored on the device and not yet answered for by the server. */
  readonly waitingPlays: () => number;
  /** Releases the scoring session (T6 §5) and stops the page acting on the game. */
  readonly leave: () => Promise<void>;
};

let held: TrackerSignOutHold | null = null;

/** Registers the open game's way out; returns the way to let go of it (unmounting). */
export function holdSignOut(hold: TrackerSignOutHold): () => void {
  held = hold;
  return () => {
    if (held === hold) held = null;
  };
}

/** The open game's way out on this page, if a game is open here. */
export function trackerSignOutHold(): TrackerSignOutHold | null {
  return held;
}

/** What a sign-out does: go ahead or not, and whether to clear the games kept here. */
export type SignOutPlan = { readonly go: boolean; readonly clearKeptGames: boolean };

/**
 * Before signing out: with a game open, asks first when plays are waiting (`ask` gets
 * their number and says whether to go on), then leaves the game. The games kept on the
 * device are cleared only when no play is waiting, so a game is never cleared while
 * plays for it wait to be sent.
 */
export async function beforeSignOut(
  hold: TrackerSignOutHold | null,
  ask: (waiting: number) => boolean,
): Promise<SignOutPlan> {
  if (hold === null) return { go: true, clearKeptGames: true };
  const waiting = hold.waitingPlays();
  if (waiting > 0 && !ask(waiting)) return { go: false, clearKeptGames: false };
  try {
    await hold.leave();
  } catch {
    // Signing out goes ahead: the session then runs out by itself (T6 §5).
  }
  return { go: true, clearKeptGames: waiting === 0 };
}

/**
 * The question's words, handed to the device by the page: the language and its plural
 * forms of `account.signOutWaiting` from the message file, and nothing else (T-187).
 */
export type WaitingQuestion = { readonly locale: string; readonly catalog: Catalog };

/** The words of the message file's question, for `catalog`'s language. */
export function waitingQuestionOf(locale: string, catalog: Catalog): WaitingQuestion {
  return {
    locale,
    catalog: Object.fromEntries(
      Object.entries(catalog).filter(([key]) => key.startsWith('account.signOutWaiting_')),
    ),
  };
}

/** The question for `waiting` plays, in the language's own plural form. */
export function waitingQuestionText(words: WaitingQuestion, waiting: number): string {
  return translatorFrom(words.locale, { [words.locale]: words.catalog }).plural(
    'account.signOutWaiting',
    waiting,
  );
}
