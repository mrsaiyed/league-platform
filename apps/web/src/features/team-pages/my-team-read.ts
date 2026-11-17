// What a public page marks as the person's own team (step 2.168; U-5, T-95), as the page's
// script reads it once the page has arrived: one small private read for whoever is signed in
// on this device, or the team this device chose (GET /api/v1/leagues/{leagueId}/my-team,
// my-team-endpoint.ts). The marks are never part of the page, which is the same for everyone
// who opens it (T5 §4): not their words, not which team. Every mark on a page asks through
// the one shared reader, so a page makes one request however many marks it has. What it
// read lasts one view of the page only: once the page's last mark has gone, it is dropped,
// so a page shown again (after Back, after signing out, by its link) asks again for whoever
// is signed in then. A read that fails leaves the page as it came, with no marks; nothing
// on it waits for this. With scripts off there are no marks, and the account menu's "My
// team" is the way to the team (step 2.127's menu works without them).
import { z } from 'zod';

/** Where a mark leads: an address on this site, never another's. */
const ownAddress = z.string().refine((href) => href.startsWith('/') && !href.startsWith('//'));

/** The endpoint's answer. */
export const myTeamReply = z.object({
  /** The signed-in person's own teams of the season, by short name. */
  teams: z.array(z.string()),
  /** The one of them the league home opens on for them, if the league opens on a team. */
  startsOn: z.string().nullable(),
  /** The teams a page marks "Your team": their own, or the one this device chose. */
  marked: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      href: ownAddress,
    }),
  ),
  words: z.object({ yours: z.string(), opensHere: z.string(), mark: z.string() }).optional(),
});
export type MyTeamReply = z.infer<typeof myTeamReply>;

/** One read of the endpoint at `address`: its answer, or null when it gave none. */
export type ReadMyTeam = (address: string) => Promise<MyTeamReply | null>;

export type SharedMyTeam = {
  /**
   * Hands `listener` the answer for `address` once it is known (at once, when it already
   * is). Returns the way to stop listening.
   */
  readonly ask: (address: string, listener: (reply: MyTeamReply) => void) => () => void;
};

type Place = {
  reply: MyTeamReply | undefined;
  readonly listeners: Set<(reply: MyTeamReply) => void>;
};

/** The page's reader: one per page, shared by its marks. `read` is how one read is made. */
export function sharedMyTeam(read: ReadMyTeam): SharedMyTeam {
  const places = new Map<string, Place>();
  async function readFor(address: string, place: Place) {
    const reply = await read(address).catch(() => null);
    // Every mark of this view has gone: nobody is left to read for.
    if (reply === null || places.get(address) !== place) return;
    place.reply = reply;
    for (const listener of [...place.listeners]) listener(reply);
  }
  return {
    ask(address, listener) {
      let place = places.get(address);
      const first = place === undefined;
      if (place === undefined) {
        place = { reply: undefined, listeners: new Set() };
        places.set(address, place);
      }
      const mine = place;
      mine.listeners.add(listener);
      if (mine.reply !== undefined) listener(mine.reply);
      if (first) void readFor(address, mine);
      return () => {
        mine.listeners.delete(listener);
        // The last mark of this view has gone (another page, or the same page shown again,
        // after Back or a sign-out): what was read goes with it, so the next view asks
        // afresh, as whoever is signed in then, and is never handed another's answer.
        if (mine.listeners.size === 0 && places.get(address) === mine) places.delete(address);
      };
    },
  };
}

/** One read from this page, with the device's own sign-in and cookie, never kept by any cache. */
export const browserReadMyTeam: ReadMyTeam = async (address) => {
  const response = await fetch(address, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const parsed = myTeamReply.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
};

/** The page's own: every mark on a page asks through this one. */
export const pageMyTeam = sharedMyTeam(browserReadMyTeam);

/** What a team's page says to a member about that team, or null when it is not theirs. */
export function yoursLine(reply: MyTeamReply, slug: string): string | null {
  if (reply.words === undefined || !reply.teams.includes(slug)) return null;
  return reply.startsOn === slug ? reply.words.opensHere : reply.words.yours;
}

/**
 * Whether a team's page still offers "Make this my team" (or "Stop using this as my team"):
 * not to a member with a team here, whose own team the league opens on whatever this device
 * chose, so the offer would do nothing for them (start-page.ts).
 */
export function offersDeviceChoice(reply: MyTeamReply | null): boolean {
  return reply === null || reply.teams.length === 0;
}
