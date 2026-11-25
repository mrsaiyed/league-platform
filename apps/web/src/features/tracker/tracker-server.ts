// The tracker's two other doors to the server, as its controller sees them: the
// scoring session (T6 §5, T-116) and the engine's state (T-113, T-253). The taps go
// through the queue's own transport (command-transport.ts). The browser's version is
// fetch-tracker-server.ts; nothing here throws, every failure is an outcome.
import type {
  SessionReply,
  SessionRequest,
  TrackerRefusal,
  TrackerRosters,
} from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';

/** The engine's state as the server holds it, and the sequence number of its last tap. */
export type ServerState = {
  readonly sequence: number;
  readonly state: basketball.GameState;
  /**
   * The command IDs of the last changes of players up to `sequence` (T-356), which the
   * state's `recent` never lists. Missing from a state kept before step 2.242, or from a
   * server that did not give them: then the device cannot tell whose they were.
   */
  readonly changes?: readonly string[];
  /** The command IDs of the plays a correction wrote up to `sequence` (T-408); missing when none. */
  readonly corrections?: readonly string[];
};

export type ServerOutcome<T> =
  /** The server answered with what was asked for. */
  | { readonly kind: 'answer'; readonly value: T }
  /**
   * The server turned the request away and asking again will not help until something
   * changes: signed out (401), may not score (403), no such game (404), or a request
   * it could not read (400). Only the server's own refusal (`TrackerRefusal`) is this.
   */
  | {
      readonly kind: 'rejected';
      readonly httpStatus: number;
      /**
       * The refusal's own code (`TrackerRefusal`). A 404 is "the game is gone" only with
       * `unknown-game`, given past the league gate; any other 404 (a hidden league, say)
       * asks for sign-in and holds the taps, as a 401 does (T-453).
       */
      readonly error?: TrackerRefusal['error'];
    }
  /**
   * No usable answer: no network, a timeout, a server error, or a page that is not the
   * server's, whatever its status. Ask again later.
   */
  | { readonly kind: 'unanswered' };

export interface TrackerServer {
  /**
   * Opens, renews, takes over or releases this device's session. A refusal (may not
   * score, no such game, cannot be scored now) is an answer: `SessionReply` has it.
   */
  session(request: SessionRequest, signal: AbortSignal): Promise<ServerOutcome<SessionReply>>;
  /** The engine's state as the server holds it now. */
  loadState(signal: AbortSignal): Promise<ServerOutcome<ServerState>>;
  /**
   * The game's two rosters as the server holds them now (record 058, step 2.118), for
   * the Players panel: a player another device added meanwhile. Left out by a door that
   * has none (a test's stand-in), and then the device lists the rosters it was given.
   */
  loadRosters?(signal: AbortSignal): Promise<ServerOutcome<TrackerRosters>>;
}
