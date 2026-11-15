// The controller's doors to the server in the browser (T6 §5; T-113, T-116, T-253): the
// game's session and state endpoints, addressed by the league's id (T-229) as the
// commands are. Answers are sorted as the commands transport sorts them: a body the
// contract does not recognise is no answer (a gym Wi-Fi sign-in page, say), whatever its
// status, and so is a state the engine cannot read, so the controller never rebuilds the
// game on one. A refusal is the server's word only in its own shape at its own status
// (`ownTrackerRefusal`): a filter's 403 page never stops scoring.
import { SessionReply, TrackerGameState, ownTrackerRefusal } from '@srleagues/contracts';
import { leagueApiUrl } from '@srleagues/core';
import { basketball } from '@srleagues/sports';
import type { ServerOutcome, ServerState, TrackerServer } from './tracker-server.ts';

export type FetchTrackerServerOptions = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly fetch?: typeof globalThis.fetch;
};

const unanswered = { kind: 'unanswered' } as const;

/** Whether the engine can read the state: a malformed one throws when it is worked out. */
const engineReads = (state: basketball.GameState): boolean => {
  try {
    basketball.derive(state);
    return true;
  } catch {
    return false;
  }
};

export function createFetchTrackerServer(options: FetchTrackerServerOptions): TrackerServer {
  const { leagueId, gameId, fetch = globalThis.fetch.bind(globalThis) } = options;
  const address = (part: 'session' | 'state') =>
    leagueApiUrl({ id: leagueId }, ['games', gameId, part]);

  /** The response and its body as JSON, or null when nothing came back. */
  const call = async (
    url: string,
    init: RequestInit,
  ): Promise<{ readonly status: number; readonly body: unknown } | null> => {
    let response: Response;
    try {
      response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
    } catch {
      return null;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return { status: response.status, body };
  };

  /** The server's own refusal, or no answer. */
  const turnedAway = <T>(answer: {
    readonly status: number;
    readonly body: unknown;
  }): ServerOutcome<T> =>
    ownTrackerRefusal(answer.status, answer.body) === null
      ? unanswered
      : { kind: 'rejected', httpStatus: answer.status };

  return {
    async session(request, signal) {
      const answer = await call(address('session'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
        // Sent even as the page goes away: leaving by closing the tab or going elsewhere
        // releases the session (tracker-opening.tsx, on "pagehide") rather than holding
        // the game until its lease runs out (T6 §5). The request is a few bytes.
        keepalive: true,
      });
      if (answer === null) return unanswered;
      // A refusal comes with 403, 404 or 409 and still carries the reply.
      const reply = SessionReply.safeParse(answer.body);
      if (reply.success) return { kind: 'answer', value: reply.data };
      return turnedAway<SessionReply>(answer);
    },

    async loadState(signal) {
      const answer = await call(address('state'), { method: 'GET', signal });
      if (answer === null) return unanswered;
      if (answer.status === 200) {
        const read = TrackerGameState.safeParse(answer.body);
        if (!read.success) return unanswered;
        // The contract checks the marks of the engine's version 1; the rest is the engine's.
        const state = read.data.state as unknown as basketball.GameState;
        if (!engineReads(state)) return unanswered;
        const value: ServerState = { sequence: read.data.sequence, state };
        return { kind: 'answer', value };
      }
      return turnedAway<ServerState>(answer);
    },
  };
}
