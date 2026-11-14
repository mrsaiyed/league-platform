// The tracker's two other doors to the server, as its controller sees them: the
// scoring session (T6 §5, T-116) and the engine's state (T-113, T-253). The taps go
// through the queue's own transport (command-transport.ts). The browser's version is
// fetch-tracker-server.ts; nothing here throws, every failure is an outcome.
import type { SessionReply, SessionRequest } from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';

/** The engine's state as the server holds it, and the sequence number of its last tap. */
export type ServerState = {
  readonly sequence: number;
  readonly state: basketball.GameState;
};

export type ServerOutcome<T> =
  /** The server answered with what was asked for. */
  | { readonly kind: 'answer'; readonly value: T }
  /**
   * The server turned the request away and asking again will not help until something
   * changes: signed out (401), may not score (403), no such game (404), or a request
   * it could not read (400).
   */
  | { readonly kind: 'rejected'; readonly httpStatus: number }
  /** No usable answer: no network, a timeout, a server error. Ask again later. */
  | { readonly kind: 'unanswered' };

export interface TrackerServer {
  /**
   * Opens, renews, takes over or releases this device's session. A refusal (may not
   * score, no such game, cannot be scored now) is an answer: `SessionReply` has it.
   */
  session(request: SessionRequest, signal: AbortSignal): Promise<ServerOutcome<SessionReply>>;
  /** The engine's state as the server holds it now. */
  loadState(signal: AbortSignal): Promise<ServerOutcome<ServerState>>;
}
