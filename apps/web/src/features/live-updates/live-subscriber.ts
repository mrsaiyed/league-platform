// Live updates, the browser's side (T6 §6; T-8, T-14, T-117 to T-120): a page
// subscribes to a game's channel or its league's live-scores channel and is handed
// each message. Nothing here can publish: publishing lives only in the server-only
// providers package, which browser code cannot import (T-30, T-120).
//
// Every message is checked against its shape and its channel before the page sees
// it; anything else is dropped. Order and gaps are the page's to judge from the
// sequence numbers (viewer-state.ts in live-game, T-118).
import { LeagueScoreMessage, LiveMessage, type LiveChannel } from '@srleagues/contracts';

/**
 * Where the connection stands. `connecting`: the first attempt. `open`: messages
 * arrive. `unavailable`: lost or refused, and being tried again; meanwhile the page
 * re-fetches the snapshot every few seconds (T-119), and fetches one when the
 * connection opens again, since messages may have been missed.
 */
export type LiveConnection = 'connecting' | 'open' | 'unavailable';

export type LiveHandlers<M> = {
  readonly onMessage: (message: M) => void;
  readonly onConnection?: (state: LiveConnection) => void;
};

export type LiveSubscription = {
  /** Stops listening. Nothing is handed to the page after this. */
  readonly close: () => void;
};

export type LiveSubscriber = {
  readonly subscribeGame: (
    leagueId: string,
    gameId: string,
    handlers: LiveHandlers<LiveMessage>,
  ) => LiveSubscription;
  readonly subscribeLeagueScores: (
    leagueId: string,
    handlers: LiveHandlers<LeagueScoreMessage>,
  ) => LiveSubscription;
};

/** What a service hands back for one channel: its raw messages and its connection. */
export type ChannelEvents = {
  readonly message: (data: unknown) => void;
  readonly connection: (state: LiveConnection) => void;
};

/** Opens one channel on a service; returns the way to stop. What every subscriber shares. */
export type ChannelOpener = (channel: LiveChannel, events: ChannelEvents) => () => void;

/** A game's message, checked against its shape and its game; else null. */
export function readGameMessage(gameId: string, data: unknown): LiveMessage | null {
  const parsed = LiveMessage.safeParse(data);
  return parsed.success && parsed.data.gameId === gameId.toLowerCase() ? parsed.data : null;
}

/** A league score message, checked against its shape; else null. */
export function readLeagueScore(data: unknown): LeagueScoreMessage | null {
  const parsed = LeagueScoreMessage.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function liveSubscriberFrom(open: ChannelOpener): LiveSubscriber {
  function subscribe<M>(
    channel: LiveChannel,
    handlers: LiveHandlers<M>,
    read: (data: unknown) => M | null,
  ): LiveSubscription {
    let closed = false;
    const stop = open(channel, {
      message: (data) => {
        if (closed) return;
        const message = read(data);
        if (message !== null) handlers.onMessage(message);
      },
      connection: (state) => {
        if (!closed) handlers.onConnection?.(state);
      },
    });
    return {
      close: () => {
        if (closed) return;
        closed = true;
        stop();
      },
    };
  }
  return {
    subscribeGame: (leagueId, gameId, handlers) =>
      subscribe({ kind: 'game', leagueId, gameId }, handlers, (data) =>
        readGameMessage(gameId, data),
      ),
    subscribeLeagueScores: (leagueId, handlers) =>
      subscribe({ kind: 'league-scores', leagueId }, handlers, readLeagueScore),
  };
}

/** Reads JSON text without throwing; undefined when it is not JSON. */
export function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** How long to wait before the next attempt: the delays in turn, then the last one. */
export const nextDelay = (delays: readonly number[], attempt: number): number =>
  delays[Math.min(attempt, delays.length - 1)] ?? 5_000;
