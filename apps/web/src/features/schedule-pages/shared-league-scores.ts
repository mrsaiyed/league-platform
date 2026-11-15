// One connection per page to a league's live scores, however many lists of games the page
// holds (the home page has two when a game is under way: "Live now" and "The next matchups").
// Each list asks to listen; the first opens the connection, the others share it, and it is
// closed when the last one stops. Subscribing only; nothing here can publish (T-120).
import type { LeagueScoreMessage } from '@srleagues/contracts';
import {
  serverSentEventsSubscriber,
  webLiveAddress,
  type LiveSubscription,
} from '../live-updates/index.ts';

type Listener = (message: LeagueScoreMessage) => void;

/** Opens the one connection for a league; what the page's lists share. */
export type OpenLeagueScores = (leagueId: string, onMessage: Listener) => LiveSubscription;

const openOnThisPage: OpenLeagueScores = (leagueId, onMessage) =>
  serverSentEventsSubscriber({ address: webLiveAddress }).subscribeLeagueScores(leagueId, {
    onMessage,
  });

export type SharedLeagueScores = {
  /** Starts handing `listener` the league's score messages; returns the way to stop. */
  readonly listen: (leagueId: string, listener: Listener) => () => void;
};

/** A set of shared connections, one a league. `open` is how a connection is made. */
export function sharedLeagueScores(open: OpenLeagueScores = openOnThisPage): SharedLeagueScores {
  const leagues = new Map<string, { listeners: Set<Listener>; connection: LiveSubscription }>();
  return {
    listen(leagueId, listener) {
      let shared = leagues.get(leagueId);
      if (shared === undefined) {
        const listeners = new Set<Listener>();
        shared = {
          listeners,
          // Every list hears every message; each keeps the games that are its own.
          connection: open(leagueId, (message) => {
            for (const each of [...listeners]) each(message);
          }),
        };
        leagues.set(leagueId, shared);
      }
      const mine = shared;
      mine.listeners.add(listener);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        mine.listeners.delete(listener);
        if (mine.listeners.size === 0) {
          mine.connection.close();
          if (leagues.get(leagueId) === mine) leagues.delete(leagueId);
        }
      };
    },
  };
}

/** The page's own: every list of games on a page listens through this one. */
export const pageLeagueScores = sharedLeagueScores();
