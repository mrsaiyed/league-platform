// The scoring screen's two doors in the browser (game-doors.ts): the game's reopen and
// not-started endpoints, addressed by the league's id (T-229) as the taps are. An answer
// is the server's word only in its own shape at its own status (`ownReopenOffer`,
// `ownReopenReply`, `ownNotStartedReply`, `ownTrackerRefusal`); anything else (a gym
// Wi-Fi sign-in page, a filter's 403) is no answer, and the screen says there is no
// connection rather than that the game cannot be reopened.
import {
  ownNotStartedReply,
  ownReopenOffer,
  ownReopenReply,
  ownTrackerRefusal,
} from '@srleagues/contracts';
import { leagueApiUrl } from '@srleagues/core';
import type { GameDoors } from './game-doors.ts';
import type { ServerOutcome } from './tracker-server.ts';

export type FetchGameDoorsOptions = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly fetch?: typeof globalThis.fetch;
};

const unanswered = { kind: 'unanswered' } as const;

export function createFetchGameDoors(options: FetchGameDoorsOptions): GameDoors {
  const { leagueId, gameId, fetch = globalThis.fetch.bind(globalThis) } = options;
  const address = (part: 'reopen' | 'not-started') =>
    leagueApiUrl({ id: leagueId }, ['games', gameId, part]);

  /** Asks, and reads the answer with `own`; the server's own refusal is `rejected`. */
  const call = async <T>(
    url: string,
    init: RequestInit,
    own: (status: number, body: unknown) => T | null,
  ): Promise<ServerOutcome<T>> => {
    let response: Response;
    try {
      response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
    } catch {
      return unanswered;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const value = own(response.status, body);
    if (value !== null) return { kind: 'answer', value };
    const refusal = ownTrackerRefusal(response.status, body);
    return refusal === null
      ? unanswered
      : { kind: 'rejected', httpStatus: response.status, error: refusal.error };
  };

  const post = (body: unknown, signal: AbortSignal): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return {
    reopenOffer: (signal) => call(address('reopen'), { method: 'GET', signal }, ownReopenOffer),
    reopen: (request, signal) => call(address('reopen'), post(request, signal), ownReopenReply),
    markNotStarted: (request, signal) =>
      call(address('not-started'), post(request, signal), ownNotStartedReply),
  };
}
