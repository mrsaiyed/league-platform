// Live updates, the server's side (T6 §6; T-8, T-14, T-117, T-120): publish a small
// message on a game's channel, or a score on its league's channel. The rest of the
// code says "publish this game update", never which service carries it.
//
// Only our server publishes. This package is server-only (T-30): browser code cannot
// import it, so no page can ever hold a publisher. Viewers only subscribe, through
// the browser-side subscribers in the web app.
//
// Every message is checked against its strict shape before it leaves, so a field the
// shape does not have (a player list, a birth date) is refused rather than sent.
import {
  LeagueScoreMessage,
  LiveMessage,
  gameChannelName,
  leagueScoresChannelName,
  liveEventName,
} from '@srleagues/contracts';

export type LivePublisher = {
  /** Publishes a game's message on that game's channel, inside its league. */
  readonly publishGame: (leagueId: string, message: LiveMessage) => Promise<void>;
  /** Publishes a game's score on its league's live-scores channel. */
  readonly publishLeagueScore: (leagueId: string, message: LeagueScoreMessage) => Promise<void>;
};

/** One checked message, ready for a service to carry. */
export type LiveDelivery = {
  readonly channel: string;
  readonly event: typeof liveEventName;
  readonly payload: LiveMessage | LeagueScoreMessage;
};

export type LivePublishErrorCode =
  | 'invalid-message'
  | 'not-authorized'
  | 'rate-limited'
  | 'unavailable'
  | 'rejected';

/**
 * A message that was not published. Viewers recover from a missed message by
 * fetching a snapshot (T-118, T-119), so a caller logs this and carries on: a
 * saved command is never undone because its message did not go out.
 */
export class LivePublishError extends Error {
  readonly code: LivePublishErrorCode;
  /** Whether trying again soon could help. */
  readonly retryable: boolean;
  /** The service's HTTP status, when there was one. */
  readonly status: number | undefined;

  constructor(code: LivePublishErrorCode, retryable: boolean, status?: number) {
    super(
      `The live message was not published: ${code}${status === undefined ? '' : ` (${status})`}.`,
    );
    this.name = 'LivePublishError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function checked<T>(build: () => T): T {
  try {
    return build();
  } catch {
    // Zod's own message can echo the values; none of it is passed on.
    throw new LivePublishError('invalid-message', false);
  }
}

export const gameDelivery = (leagueId: string, message: LiveMessage): LiveDelivery =>
  checked(() => ({
    channel: gameChannelName(leagueId, message.gameId),
    event: liveEventName,
    payload: LiveMessage.parse(message),
  }));

export const leagueScoreDelivery = (leagueId: string, message: LeagueScoreMessage): LiveDelivery =>
  checked(() => ({
    channel: leagueScoresChannelName(leagueId),
    event: liveEventName,
    payload: LeagueScoreMessage.parse(message),
  }));

/** A publisher from one way of carrying a checked message: what every adapter shares. */
export const livePublisherFrom = (
  deliver: (delivery: LiveDelivery) => Promise<void>,
): LivePublisher => ({
  publishGame: async (leagueId, message) => deliver(gameDelivery(leagueId, message)),
  publishLeagueScore: async (leagueId, message) => deliver(leagueScoreDelivery(leagueId, message)),
});
