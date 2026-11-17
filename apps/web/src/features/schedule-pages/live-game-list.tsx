'use client';
// A list of game cards whose live games change as the league's live channel says (T6 §6):
// the Live marker and the running score appear and move without a refresh. Subscribing
// only; this page can never publish (T-120). Where the channel cannot be reached the page
// simply shows what it was given.
import { useEffect, useState } from 'react';
import { GameCard, listRoom, type GameCardLabels, type GameStatus } from '@srleagues/ui';
import type { GameView, OvertimeWords } from './build-schedule.ts';
import { gameLinkText, type GameLinkWords } from './game-link-text.ts';
import { mayBeOffered, OfferButton, useScoringOffers } from './score-game-button.tsx';
import { pageLeagueScores } from './shared-league-scores.ts';

export type Update = {
  readonly sequence: number;
  readonly status: GameStatus;
  readonly home: number;
  readonly away: number;
  /** The period the game stood in, as the channel said: where a game that ended, ended. */
  readonly period?: number;
  /**
   * The live channel has said, since the page was drawn, that the game is not final: it
   * was reopened (or had not ended when the page was drawn). Kept once true, so a game
   * reopened and ended again never shows the overtime its page was drawn with: the
   * channel does not say a result's overtime periods.
   */
  readonly leftFinal?: boolean;
};

const known: readonly GameStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
  'postponed',
  'cancelled',
];

/**
 * The game as the newest live message says it is; the game itself when there is none. Its
 * card leads to its page whatever its state, so that does not change.
 *
 * A game the channel says is final was ended by its tracker (only the tracker's saves are
 * sent), in the period the message names: its overtime is that period less the game's
 * regulation periods, as its result keeps it (P7 §5.6), and the card says so at once, in
 * the words the server wrote for that count. Without the words or the period (a page
 * drawn before either was sent), the words the page was drawn with stand only while the
 * game is still that result: final, the same score, never reopened since.
 */
export function applyUpdate(
  game: GameView,
  update: Update | undefined,
  overtime?: OvertimeWords,
): GameView {
  if (update === undefined) return game;
  const { finalText, finalSaid, ...rest } = game;
  const moved = {
    ...rest,
    status: update.status,
    home: { ...game.home, score: update.home },
    away: { ...game.away, score: update.away },
  };
  if (update.status === 'final' && update.period !== undefined && overtime !== undefined) {
    const count = Math.max(0, Math.round(update.period) - game.periods);
    const pill = count > 0 ? overtime.pill[count] : undefined;
    const said = count > 0 ? overtime.said[count] : undefined;
    return {
      ...moved,
      ...(pill === undefined || pill === '' ? {} : { finalText: pill }),
      ...(said === undefined || said === '' ? {} : { finalSaid: said }),
    };
  }
  const sameResult =
    update.status === 'final' &&
    update.leftFinal !== true &&
    update.home === game.home.score &&
    update.away === game.away.score;
  return {
    ...moved,
    ...(sameResult && finalText !== undefined ? { finalText } : {}),
    ...(sameResult && finalSaid !== undefined ? { finalSaid } : {}),
  };
}

export function LiveGameList({
  leagueId,
  games,
  labels,
  linkWords,
  announcement,
  layout = 'rows',
  across = 'two',
  featured = false,
  awaitingLabel,
  scoringAddress,
  overtimeWords,
}: {
  readonly leagueId: string;
  /**
   * The scoring endpoint's address (leagueApiUrl): asked after the page, on this device, which
   * of these games its signed-in person may score (step 2.153). The page holds no more.
   */
  readonly scoringAddress?: string;
  readonly games: readonly GameView[];
  /** Compact cards, or scoreboards: one across in a column of their own, or two. */
  readonly layout?: 'rows' | 'board';
  readonly across?: 'one' | 'two' | 'pair';
  /** The game being played now, picked out from the others. */
  readonly featured?: boolean;
  /** The quiet word on a game whose start has passed with no result: "Awaiting result". */
  readonly awaitingLabel?: string;
  readonly labels: GameCardLabels;
  /** A final game's pill and link words for each count of overtime periods (build-schedule.ts). */
  readonly overtimeWords?: OvertimeWords;
  /** What each card's link says to a screen reader, to be filled for each game as it stands. */
  readonly linkWords: GameLinkWords;
  /** The sentence read out when a score changes, with {away} {awayScore} {home} {homeScore} {status}. */
  readonly announcement: string;
}) {
  const [updates, setUpdates] = useState<Readonly<Record<string, Update>>>({});
  const [spoken, setSpoken] = useState('');
  const watched = games.some(
    (g) => g.status === 'live' || g.status === 'scheduled' || g.status === 'postponed',
  );
  useEffect(() => {
    if (!watched) return undefined;
    const ids = new Set(games.map((g) => g.id));
    // One connection for the whole page: every list on it listens through the same one.
    return pageLeagueScores.listen(leagueId, (m) => {
      if (!ids.has(m.gameId)) return;
      const status = known.find((s) => s === m.status);
      if (status === undefined) return;
      setUpdates((prev) => {
        const before = prev[m.gameId];
        if (before !== undefined && before.sequence >= m.sequence) return prev;
        const game = games.find((g) => g.id === m.gameId);
        if (game !== undefined) {
          const word =
            status === 'live' ? labels.live : status === 'scheduled' ? '' : labels[status];
          setSpoken(
            announcement
              .replace('{away}', game.away.name)
              .replace('{awayScore}', String(m.score.away))
              .replace('{home}', game.home.name)
              .replace('{homeScore}', String(m.score.home))
              .replace('{status}', word),
          );
        }
        return {
          ...prev,
          [m.gameId]: {
            sequence: m.sequence,
            status,
            home: m.score.home,
            away: m.score.away,
            period: m.period,
            leftFinal: before?.leftFinal === true || status !== 'final',
          },
        };
      });
    });
  }, [leagueId, games, watched, labels, announcement]);
  const shown = games.map((raw) => applyUpdate(raw, updates[raw.id], overtimeWords));
  // "Score this game" for the person signed in here, once the read says they may (step 2.153).
  // A game the live channel has since ended offers nothing.
  const scoring = useScoringOffers(
    scoringAddress,
    games.filter((g) => mayBeOffered(g.status)).map((g) => g.id),
  );
  const actionOf = (g: GameView) => {
    const offer = scoring.offers.get(g.id);
    if (offer === undefined || scoring.words === undefined || !mayBeOffered(g.status)) {
      return undefined;
    }
    return (
      <OfferButton
        offer={offer}
        words={scoring.words}
        which={{ away: g.away.name, home: g.home.name }}
      />
    );
  };
  // Every board of the list reckons with the same room, so the list is one shape: all
  // side by side, or all as two rows (never one of each under the other).
  const room = layout === 'board' ? listRoom(shown) : undefined;
  return (
    <>
      <p className="ui-visually-hidden" role="status" aria-live="polite">
        {spoken}
      </p>
      <ul
        className="ui-card-grid"
        data-layout={layout === 'board' ? 'board' : undefined}
        data-across={layout === 'board' ? across : undefined}
      >
        {shown.map((g) => {
          return (
            <li key={g.id}>
              <GameCard
                home={g.home}
                away={g.away}
                status={g.status}
                finalText={g.finalText}
                whenText={
                  // A board's pill says "Postponed", so its date line need not: the shorter
                  // line is drawn there (and only while the game is still postponed).
                  layout === 'board' && g.status === 'postponed' && g.whenBesidePill !== undefined
                    ? g.whenBesidePill
                    : g.whenText
                }
                {...(g.placeText === undefined ? {} : { placeText: g.placeText })}
                {...(g.numberText === undefined ? {} : { numberText: g.numberText })}
                detailsHref={g.detailsHref}
                linkText={gameLinkText(g, linkWords)}
                labels={labels}
                layout={layout}
                featured={featured}
                room={room}
                action={actionOf(g)}
                {...(g.awaiting === true && awaitingLabel !== undefined
                  ? { note: awaitingLabel }
                  : {})}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
