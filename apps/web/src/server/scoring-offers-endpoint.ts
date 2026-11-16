// GET /api/v1/leagues/{leagueId}/scoring?games={id},{id}… (step 2.153; S-38, S-50; P7 §5.1):
// which of the games a public page shows the person signed in on this device may score, each
// with its button's kind and where it leads, and the buttons' words. The page's own script
// asks after the page has arrived (features/schedule-pages/scoring-offers.ts), so the page is
// the same for everyone who opens it and holds no trace of a button (T5 §4).
//
// The league comes from the address and the account from the session (league-api.ts), never
// from the request; the ids asked are only a question. A league its visitor may not see (a
// draft or a suspended one, mayOpenLeague, U-9) is "not found", exactly the answer for a
// league that does not exist or is in the bin, and the same as the other public read's (the
// snapshot, game-snapshot-endpoint.ts), so the answer never tells anyone a hidden league is
// there. Which games is games.list_scoring_offers' rule, the one the scoring commands enforce.
// A visitor, a session that no longer works, and anyone who scores nowhere in the league get
// no games and no words; nothing is said about a game the person may not score, nor whether
// it exists. Always private, never kept by a cache.
import {
  gameAnchor,
  leagueUrl,
  listScoringOffers,
  mayOpenLeague,
  mayOpenTracker,
  scoringOffersLimit,
  type AccessHolder,
  type CommandContext,
  type ScoringOffer,
} from '@srleagues/core';
import type { CommandDeps, LeagueAddressee, TrackerTx } from '@srleagues/core';
import type { ScoringOfferReply } from '../features/schedule-pages/index.ts';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, refusalAnswer, type ApiAnswer, type ApiRefusal } from './league-api.ts';
import { t } from './messages.ts';
import { NotOnTheDatabaseYet } from './not-on-the-database-yet.ts';

const privately = { 'Cache-Control': 'private, no-store' } as const;
const answer = (body: ScoringOfferReply): ApiAnswer => ({ status: 200, body, headers: privately });

/**
 * "Not found", for a league that is not there, is in the bin, or may not be seen by this
 * person: the very answer the snapshot gives a hidden league (game-snapshot-endpoint.ts),
 * so this read and that one say the same.
 */
const notFound: ApiAnswer = {
  status: 404,
  body: { error: 'not-found' },
  headers: { 'Cache-Control': 'no-store' },
};

/** What the read needs from the web app's ports. */
export type ScoringOffersPorts = {
  /** What the account holds in the league, read fresh (T-75). */
  readonly accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>;
  /** What the games commands run on, reached only once there is someone to ask for. */
  readonly games: () => CommandDeps<TrackerTx>;
};

/**
 * Where a button leads: the tracker's opening screen for a game recorded live; for one
 * recorded as a box score its grid in Games; for a final score its entry in the games list.
 */
export function offerHref(league: LeagueAddressee, offer: ScoringOffer): string {
  if (offer.recording === 'live') return leagueUrl(league, 'score', { game: offer.gameId });
  if (offer.recording === 'box-score') {
    return leagueUrl(league, 'admin-area', { area: 'games', subpath: [offer.gameId] });
  }
  return `${leagueUrl(league, 'admin-area', { area: 'games' })}#${gameAnchor(offer.gameId)}`;
}

/** The ids asked about, as the address gives them: games' ids only, at most the read's limit. */
export function askedGameIds(games: string | null): readonly string[] {
  const ids = (games ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(isGameIdFormat);
  return [...new Set(ids)].slice(0, scoringOffersLimit);
}

/**
 * The answer to the read, from the league request as league-api.ts resolved it with the
 * ports beside it (or why there is none), and the address's `games`.
 */
export async function scoringOffersRequest(
  resolved:
    | {
        readonly ok: true;
        readonly context: LeagueRequestContext;
        readonly ports: ScoringOffersPorts;
      }
    | { readonly ok: false; readonly refusal: ApiRefusal },
  games: string | null,
): Promise<ApiAnswer> {
  // Every answer is private and never kept. "Not found" is the one exception: it says
  // exactly what the snapshot's says for a hidden league (no-store), so the two public
  // reads cannot be told apart.
  if (!resolved.ok) {
    if (resolved.refusal.status === 404) return notFound;
    return { ...refusalAnswer(resolved.refusal), headers: privately };
  }
  const { context, ports } = resolved;
  const holder =
    context.account === null ? undefined : await ports.accessOf(commandContextOf(context));
  // The league gate, as for the league's pages and the snapshot (U-9).
  if (!mayOpenLeague(context.league.status, holder)) return notFound;
  const none = answer({ games: [] });
  // Someone who holds no permission to score anywhere in the league (games.score, the one
  // games.list_scoring_offers asks for) is told nothing, and the games area is not reached:
  // every signed-in person's page asks, a coach's and a fan's too.
  if (context.account === null || !mayOpenTracker(holder)) return none;
  const gameIds = askedGameIds(games);
  if (gameIds.length === 0) return none;
  try {
    return await scoringOffers(context, gameIds, ports.games);
  } catch (error) {
    // On the database the games area has not moved yet (database-ports.ts, notMovedYet):
    // until it has, a scorer's page gets no buttons rather than an error. Only that one
    // refusal is caught; this catch goes when the games area moves (step 2.93).
    if (error instanceof NotOnTheDatabaseYet) return none;
    throw error;
  }
}

/** The read for someone who may see the league and scores somewhere in it. */
async function scoringOffers(
  context: LeagueRequestContext,
  gameIds: readonly string[],
  deps: () => CommandDeps<TrackerTx>,
): Promise<ApiAnswer> {
  const none = answer({ games: [] });
  const listed = await listScoringOffers(commandContextOf(context), { gameIds }, deps());
  if (!listed.ok || listed.value.games.length === 0) return none;
  const league = context.league;
  return answer({
    games: listed.value.games.map((offer) => ({
      gameId: offer.gameId,
      kind: offer.recording === 'live' ? 'score' : 'enter',
      href: offerHref(league, offer),
    })),
    words: {
      score: t('schedule.offer.score'),
      enter: t('schedule.offer.enter'),
      which: t('schedule.offer.which', { away: '{away}', home: '{home}' }),
    },
  });
}
