'use client';
// A list of game cards whose live games change as the league's live channel says (T6 §6):
// the Live marker and the running score appear and move without a refresh. Subscribing
// only; this page can never publish (T-120). Where the channel cannot be reached the page
// simply shows what it was given.
import { useEffect, useState } from 'react';
import { GameCard, type GameCardLabels, type GameStatus } from '@srleagues/ui';
import { serverSentEventsSubscriber } from '../live-updates/index.ts';
import type { GameView } from './build-schedule.ts';

/** The web app's own live address (T-14). */
const liveAddress = '/api/v1/live';

export type Update = {
  readonly sequence: number;
  readonly status: GameStatus;
  readonly home: number;
  readonly away: number;
};

const known: readonly GameStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
  'postponed',
  'cancelled',
];

/** The game as the newest live message says it is; the game itself when there is none. */
export function applyUpdate(game: GameView, update: Update | undefined): GameView {
  if (update === undefined) return game;
  return {
    ...game,
    status: update.status,
    home: { ...game.home, score: update.home },
    away: { ...game.away, score: update.away },
  };
}

export function LiveGameList({
  leagueId,
  games,
  labels,
}: {
  readonly leagueId: string;
  readonly games: readonly GameView[];
  readonly labels: GameCardLabels;
}) {
  const [updates, setUpdates] = useState<Readonly<Record<string, Update>>>({});
  const watched = games.some((g) => g.status === 'live' || g.status === 'scheduled');
  useEffect(() => {
    if (!watched) return undefined;
    const ids = new Set(games.map((g) => g.id));
    const subscription = serverSentEventsSubscriber({ address: liveAddress }).subscribeLeagueScores(
      leagueId,
      {
        onMessage: (m) => {
          if (!ids.has(m.gameId)) return;
          const status = known.find((s) => s === m.status);
          if (status === undefined) return;
          setUpdates((prev) => {
            const before = prev[m.gameId];
            if (before !== undefined && before.sequence >= m.sequence) return prev;
            return {
              ...prev,
              [m.gameId]: { sequence: m.sequence, status, home: m.score.home, away: m.score.away },
            };
          });
        },
      },
    );
    return () => subscription.close();
  }, [leagueId, games, watched]);
  return (
    <ul>
      {games.map((raw) => {
        const g = applyUpdate(raw, updates[raw.id]);
        return (
          <li key={g.id}>
            <GameCard
              home={g.home}
              away={g.away}
              status={g.status}
              whenText={g.whenText}
              {...(g.numberText === undefined ? {} : { numberText: g.numberText })}
              {...(g.detailsHref === undefined ? {} : { detailsHref: g.detailsHref })}
              labels={labels}
            />
          </li>
        );
      })}
    </ul>
  );
}
