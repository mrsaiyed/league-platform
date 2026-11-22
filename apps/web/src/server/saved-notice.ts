// The one-time "Saved" notice (T-271, record 067). A form that saved something sends the
// browser to the screen again (post, redirect, get) and leaves this notice for the person
// who sent it, in this league: only which screen, which thing was saved and what was done
// to it, never anything typed. The screen takes it as it is drawn and says "Saved" beside
// that thing; taking it clears it, so a reload shows nothing old.
//
// It is kept in this server's memory, not in a cookie or the address: with scripts on,
// Next.js draws the screen the browser is sent to inside the answer to the post, and that
// drawing does not see a cookie the post has just set. A notice nobody takes is gone after
// a minute. The web app runs as one server (T-270); a second one would need this, and
// same-request.ts, behind a port both servers share.

/** The screens that say "Saved" from a notice. */
export const noticeScreens = [
  'games',
  'box-score',
  'schedule',
  'people',
  'person',
  'divisions',
  'venues',
] as const;
export type NoticeScreen = (typeof noticeScreens)[number];

export type SavedNotice = {
  readonly screen: NoticeScreen;
  /** The id of the thing saved: a game, a person (step 2.50), a division, a venue or a court (step 2.49). */
  readonly thing: string;
  /** What was done to it, as the last part of a message key: `final`, `reopen`… */
  readonly said: string;
  /**
   * Other things the notice names, by id: the games that took a game's place since it was
   * called off, when it is put back (step 2.158); on the schedule, the round a game was
   * removed from (step 2.185). Ids only, never anything typed.
   */
  readonly about?: readonly string[];
  /**
   * The thing's name as stored, read from the store when it was done, never from the form:
   * a person, division or court just put in the bin cannot be read again to be named in
   * "Removed …" (steps 2.49 and 2.50). Held here for one look, as the rest.
   */
  readonly name?: string;
};

export type SavedNotices = {
  /** Leaves the notice for this person in this league, in place of any before it. */
  readonly leave: (holder: string, notice: SavedNotice) => void;
  /** The notice left for this person and screen, taken: it is not there a second time. */
  readonly take: (holder: string, screen: NoticeScreen) => SavedNotice | undefined;
};

/** Whose notices: one person in one league. Undefined for a visitor, who saves nothing. */
export function noticeHolderOf(context: {
  readonly leagueId: string;
  readonly accountId: string | null;
}): string | undefined {
  return context.accountId === null ? undefined : `${context.accountId}:${context.leagueId}`;
}

export function savedNotices(options: {
  /** How long a notice waits to be taken (ms). */
  readonly keepMs: number;
  /** The most notices kept; the oldest go first. */
  readonly most: number;
  readonly now?: () => number;
}): SavedNotices {
  const now = options.now ?? Date.now;
  const left = new Map<string, SavedNotice & { readonly at: number }>();
  return {
    leave: (holder, notice) => {
      left.delete(holder);
      for (const [key, entry] of left) {
        if (entry.at < now() - options.keepMs || left.size >= options.most) left.delete(key);
        else break;
      }
      left.set(holder, { ...notice, at: now() });
    },
    take: (holder, screen) => {
      const found = left.get(holder);
      if (found === undefined || found.screen !== screen) return undefined;
      left.delete(holder);
      if (found.at < now() - options.keepMs) return undefined;
      return {
        screen: found.screen,
        thing: found.thing,
        said: found.said,
        ...(found.about === undefined ? {} : { about: found.about }),
        ...(found.name === undefined ? {} : { name: found.name }),
      };
    },
  };
}

const key = '__srleaguesSavedNotices';
type Holder = { [key]?: SavedNotices };

/**
 * This server's notices. Kept on globalThis, not in this module: Next.js may load a file
 * more than once in one process (container.ts), and the form and the screen must share it.
 */
export function savedNoticesHere(): SavedNotices {
  const holder = globalThis as Holder;
  holder[key] ??= savedNotices({ keepMs: 60_000, most: 5000 });
  return holder[key];
}
