// GET /api/v1/leagues/{leagueId}/scoring?games={id},{id}… (step 2.153; S-38, S-50; P7 §5.1):
// which of the games a public page shows the person signed in on this device may score, each
// with its button's kind and where it leads, and the buttons' words. The page's own script
// asks after the page has arrived (features/schedule-pages/scoring-offers.ts), so the page is
// the same for everyone who opens it and holds no trace of a button (T5 §4).
//
// The league comes from the address and the account from the session (league-api.ts), never
// from the request; the ids asked are only a question. Which games is games.list_scoring_offers'
// rule, the one the scoring commands enforce. A visitor, a session that no longer works, and
// anyone who scores nowhere in the league get no games and no words; nothing is said about a
// game the person may not score, nor whether it exists. Always private, never kept by a cache.
import {
  leagueUrl,
  listScoringOffers,
  scoringOffersLimit,
  type ScoringOffer,
} from '@srleagues/core';
import type { CommandDeps, LeagueAddressee, TrackerTx } from '@srleagues/core';
import { gameAnchor } from '../features/games-area/index.ts';
import type { ScoringOfferReply } from '../features/schedule-pages/index.ts';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import { t } from './messages.ts';

const privately = { 'Cache-Control': 'private, no-store' } as const;
const answer = (body: ScoringOfferReply): ApiAnswer => ({ status: 200, body, headers: privately });

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

export async function scoringOffers(
  context: LeagueRequestContext,
  games: string | null,
  /** What the games commands run on, reached only once there is someone to ask for. */
  deps: () => CommandDeps<TrackerTx>,
): Promise<ApiAnswer> {
  const none = answer({ games: [] });
  if (context.account === null) return none;
  const gameIds = askedGameIds(games);
  if (gameIds.length === 0) return none;
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
