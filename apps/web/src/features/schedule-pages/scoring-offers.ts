// The "Score this game" buttons of a public page (step 2.153; S-38, S-50), as the page's
// script reads them once the page has arrived: one small private read for the person signed
// in on this device (GET /api/v1/leagues/{leagueId}/scoring, scoring-offers-endpoint.ts). The
// buttons are never part of the page, which is the same for everyone who opens it (T5 §4):
// not their words, not where they lead. Every list of games on a page asks through the one
// shared reader, so a page makes one request (one per hundred games), a game asked by two
// lists is read once, and a game a list asks about later is read then. What it read lasts
// one view of the page only: once the page's last list has gone, it is dropped, so a page
// shown again (after Back, after signing out, by its link) asks again for whoever is signed
// in then. A read that fails leaves the page as it came, with no buttons; nothing on it
// waits for this.
import { z } from 'zod';
import { fill } from './game-link-text.ts';

/** Where a button leads: an address on this site, never another's. */
const ownAddress = z.string().refine((href) => href.startsWith('/') && !href.startsWith('//'));

/** The endpoint's answer: the games the person may score, and, with them, the buttons' words. */
export const scoringOfferReply = z.object({
  games: z.array(
    z.object({
      gameId: z.string(),
      /** `score`: the tracker's opening screen. `enter`: the game's entry in Games. */
      kind: z.enum(['score', 'enter']),
      href: ownAddress,
    }),
  ),
  words: z.object({ score: z.string(), enter: z.string(), which: z.string() }).optional(),
  /**
   * Asked with `correct={id}` only (the public game page): "Correct this result" for the
   * person who may reopen that decided game, and where it leads (step 2.56, H5).
   */
  pencil: z.object({ gameId: z.string(), href: ownAddress, label: z.string() }).optional(),
});
export type ScoringOfferReply = z.infer<typeof scoringOfferReply>;
export type ScoringOffer = ScoringOfferReply['games'][number];
export type OfferWords = NonNullable<ScoringOfferReply['words']>;

/** What a page knows so far: the buttons by game id, and their words once any came. */
export type PageOffers = {
  readonly offers: ReadonlyMap<string, ScoringOffer>;
  readonly words: OfferWords | undefined;
};

export const noOffers: PageOffers = { offers: new Map(), words: undefined };

/** The most games one read asks about: what games.list_scoring_offers takes at once. */
export const offersAskedAtOnce = 100;

/** One read of the endpoint at `address` for these games: its answer, or null when it gave none. */
export type ReadOffers = (
  address: string,
  gameIds: readonly string[],
) => Promise<ScoringOfferReply | null>;

/** Hands a run to later, after the lists drawn at the same time have all asked. */
export type Later = (run: () => void) => void;

export type SharedScoringOffers = {
  /**
   * Asks for these games at `address` and hands `listener` what the page knows each time it
   * learns more (at once, when it already knows some). Returns the way to stop listening.
   */
  readonly ask: (
    address: string,
    gameIds: readonly string[],
    listener: (known: PageOffers) => void,
  ) => () => void;
};

type Place = {
  readonly asked: Set<string>;
  readonly waiting: Set<string>;
  readonly offers: Map<string, ScoringOffer>;
  words: OfferWords | undefined;
  readonly listeners: Set<(known: PageOffers) => void>;
  planned: boolean;
};

/** The page's reader: one per page, shared by its lists. `read` is how one read is made. */
export function sharedScoringOffers(
  read: ReadOffers,
  later: Later = (run) => queueMicrotask(run),
): SharedScoringOffers {
  const places = new Map<string, Place>();
  const known = (place: Place): PageOffers => ({
    offers: new Map(place.offers),
    words: place.words,
  });
  async function readWaiting(address: string, place: Place) {
    place.planned = false;
    const ids = [...place.waiting];
    place.waiting.clear();
    let learned = false;
    for (let at = 0; at < ids.length; at += offersAskedAtOnce) {
      // Every list of this view has gone: nobody is left to read for.
      if (places.get(address) !== place) return;
      const reply = await read(address, ids.slice(at, at + offersAskedAtOnce)).catch(() => null);
      if (reply === null) continue;
      for (const offer of reply.games) place.offers.set(offer.gameId, offer);
      if (reply.words !== undefined) place.words = reply.words;
      learned ||= reply.games.length > 0;
    }
    if (!learned) return;
    const now = known(place);
    for (const listener of [...place.listeners]) listener(now);
  }
  return {
    ask(address, gameIds, listener) {
      let place = places.get(address);
      if (place === undefined) {
        place = {
          asked: new Set(),
          waiting: new Set(),
          offers: new Map(),
          words: undefined,
          listeners: new Set(),
          planned: false,
        };
        places.set(address, place);
      }
      const mine = place;
      mine.listeners.add(listener);
      for (const id of gameIds) {
        if (mine.asked.has(id)) continue;
        mine.asked.add(id);
        mine.waiting.add(id);
      }
      if (mine.offers.size > 0) listener(known(mine));
      if (mine.waiting.size > 0 && !mine.planned) {
        mine.planned = true;
        later(() => void readWaiting(address, mine));
      }
      return () => {
        mine.listeners.delete(listener);
        // The last list of this view has gone (another page, or the same page shown again,
        // after Back or a sign-out): what was read goes with it, so the next view asks
        // afresh, as whoever is signed in then, and is never handed offers read for another.
        if (mine.listeners.size === 0 && places.get(address) === mine) places.delete(address);
      };
    },
  };
}

/** One read from this page, with the device's own sign-in, never kept by any cache. */
export const browserReadOffers: ReadOffers = async (address, gameIds) => {
  const query = new URLSearchParams({ games: gameIds.join(',') });
  const response = await fetch(`${address}?${query.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const parsed = scoringOfferReply.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
};

/** The page's own: every list of games on a page asks through this one. */
export const pageScoringOffers = sharedScoringOffers(browserReadOffers);

/**
 * What a screen reader hears for a button where several are near, naming the game: "Score
 * this game: Bears against Hawks". The message's braces are filled in one pass, so a team
 * named with braces or $ patterns is said as it is named.
 */
export function offerWhich(
  words: OfferWords,
  kind: ScoringOffer['kind'],
  away: string,
  home: string,
): string {
  return fill(words.which, { action: kind === 'score' ? words.score : words.enter, away, home });
}
