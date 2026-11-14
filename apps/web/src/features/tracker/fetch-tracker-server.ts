// The controller's doors to the server in the browser (T6 §5; T-113, T-116, T-253): the
// game's session and state endpoints, addressed by the league's id (T-229) as the
// commands are. Answers are sorted as the commands transport sorts them: a body the
// contract does not recognise is no answer (a gym Wi-Fi sign-in page, say), and so is a
// state the engine cannot read, so the controller never rebuilds the game on one.
import { SessionReply, TrackerGameState } from '@srleagues/contracts';
import { leagueApiUrl } from '@srleagues/core';
import { basketball } from '@srleagues/sports';
import type { ServerOutcome, ServerState, TrackerServer } from './tracker-server.ts';

export type FetchTrackerServerOptions = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly fetch?: typeof globalThis.fetch;
};

const unanswered = { kind: 'unanswered' } as const;

/** Statuses where the same request may well work later: a timeout, too many, the server's fault. */
const tryAgainLater = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

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

  const turnedAway = <T>(status: number): ServerOutcome<T> =>
    tryAgainLater(status) || status < 400 ? unanswered : { kind: 'rejected', httpStatus: status };

  return {
    async session(request, signal) {
      const answer = await call(address('session'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
      if (answer === null) return unanswered;
      // A refusal comes with 403, 404 or 409 and still carries the reply.
      const reply = SessionReply.safeParse(answer.body);
      if (reply.success) return { kind: 'answer', value: reply.data };
      return turnedAway(answer.status);
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
      return turnedAway(answer.status);
    },
  };
}
