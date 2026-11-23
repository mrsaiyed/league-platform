'use client';
// "Score this game" or "Enter the score" (step 2.153; S-38, S-50), drawn on this device only
// once the page's one private read says the person signed in here may score the game
// (scoring-offers.ts). The page as it arrives holds no trace of it, so it is the same for
// everyone (T5 §4); with scripts off there is no button, and the account menu's "My games
// to score" (step 2.127) is the way to the games. The shared button piece, the main kind.
import { useEffect, useState } from 'react';
import {
  noOffers,
  offerWhich,
  pageScoringOffers,
  scoringOfferReply,
  type OfferWords,
  type PageOffers,
  type ScoringOffer,
  type ScoringOfferReply,
  type SharedScoringOffers,
} from './scoring-offers.ts';

/** "Correct this result" and where it leads, as the private read gave it. */
export type Pencil = NonNullable<ScoringOfferReply['pencil']>;

/** A game a button can be offered on: one still to be played or being played. */
export const mayBeOffered = (status: string): boolean =>
  status === 'scheduled' || status === 'live';

/** What the page knows of these games' buttons at `address`; nothing until the read answers. */
export function useScoringOffers(
  address: string | undefined,
  gameIds: readonly string[],
  shared: SharedScoringOffers = pageScoringOffers,
): PageOffers {
  const [known, setKnown] = useState<PageOffers>(noOffers);
  const asked = gameIds.join(',');
  useEffect(() => {
    if (address === undefined || asked === '') return undefined;
    return shared.ask(address, asked.split(','), setKnown);
  }, [address, asked, shared]);
  return known;
}

/** The button itself; `which` names the game for a screen reader where several are near. */
export function OfferButton({
  offer,
  words,
  which,
}: {
  readonly offer: ScoringOffer;
  readonly words: OfferWords;
  readonly which?: { readonly away: string; readonly home: string } | undefined;
}) {
  const label = offer.kind === 'score' ? words.score : words.enter;
  return (
    <a className="ui-button" data-kind="main" data-offer={offer.kind} href={offer.href}>
      {which === undefined ? (
        label
      ) : (
        <>
          {/* Seen: the words. Heard: the words and the game, as one sentence. */}
          <span aria-hidden="true">{label}</span>
          <span className="ui-visually-hidden" dir="auto">
            {offerWhich(words, offer.kind, which.away, which.home)}
          </span>
        </>
      )}
    </a>
  );
}

/** A game page's button, under its title: nothing until the read says this person may score it. */
export function GameOffer({
  address,
  gameId,
  status,
}: {
  /** The scoring endpoint's address (leagueApiUrl). */
  readonly address: string;
  readonly gameId: string;
  /** The game's status as the page was drawn: only a game still to be decided is asked about. */
  readonly status: string;
}) {
  const open = mayBeOffered(status);
  const known = useScoringOffers(address, open ? [gameId] : []);
  const offer = known.offers.get(gameId);
  // A page drawn again as the game ends (record 051) keeps what it read, but offers nothing.
  if (!open || offer === undefined || known.words === undefined) return null;
  return (
    <p className="ui-page-sub" data-game-offer="">
      <OfferButton offer={offer} words={known.words} />
    </p>
  );
}

/** A game the pencil can be offered on: one decided. */
export const mayBeCorrected = (status: string): boolean =>
  status === 'final' || status === 'forfeit';

/** The pencil's one private read: "Correct this result" for this game, or nothing. */
export async function readPencil(address: string, gameId: string): Promise<Pencil | null> {
  const query = new URLSearchParams({ correct: gameId });
  const response = await fetch(`${address}?${query.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  const parsed = scoringOfferReply.safeParse(await response.json().catch(() => null));
  const pencil = parsed.success ? parsed.data.pencil : undefined;
  return pencil !== undefined && pencil.gameId === gameId ? pencil : null;
}

/**
 * The public pencil (step 2.56, H5; P4 §1): on a decided game's page, "Correct this result"
 * for the signed-in person who may reopen it, leading to its reopen form in Games, as the
 * games list offers it (step 2.154). Drawn on this device only after the page has arrived,
 * from the private read, so the page itself is the same for everyone; nothing until then,
 * and nothing with scripts off.
 */
export function GameCorrection({
  address,
  gameId,
  status,
  read = readPencil,
}: {
  readonly address: string;
  readonly gameId: string;
  readonly status: string;
  readonly read?: (address: string, gameId: string) => Promise<Pencil | null>;
}) {
  const decided = mayBeCorrected(status);
  const [pencil, setPencil] = useState<Pencil | null>(null);
  useEffect(() => {
    setPencil(null);
    if (!decided) return undefined;
    let live = true;
    void read(address, gameId).then((found) => {
      if (live) setPencil(found);
    });
    return () => {
      live = false;
    };
  }, [address, gameId, decided, read]);
  if (!decided || pencil === null) return null;
  return (
    <p className="ui-page-sub" data-game-pencil="">
      <a className="ui-button" href={pencil.href}>
        {pencil.label}
      </a>
    </p>
  );
}
