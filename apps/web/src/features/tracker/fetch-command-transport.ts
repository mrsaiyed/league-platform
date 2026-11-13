// The queue's way to the server in the browser: one POST of a batch to the game's
// commands endpoint (T6 §3), addressed by the league's id so a queue held across a
// change of short name still arrives (T-229). The answer is sorted into the five
// outcomes the queue knows; nothing here throws.
import { CommandReply, VersionRefusal } from '@srleagues/contracts';
import { leagueApiUrl } from '@srleagues/core';
import type { CommandTransport, TransportOutcome } from './command-transport.ts';

export type FetchCommandTransportOptions = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly fetch?: typeof globalThis.fetch;
};

/** Statuses where the same request may well work later: a timeout, too many, the server's fault. */
const tryAgainLater = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

/** Statuses about who is asking or what for, not about the taps: the queue halts. */
const turnedAway = (status: number): boolean => status === 401 || status === 403 || status === 404;

export function createFetchCommandTransport(
  options: FetchCommandTransportOptions,
): CommandTransport {
  const { leagueId, gameId, fetch = globalThis.fetch.bind(globalThis) } = options;
  const address = leagueApiUrl({ id: leagueId }, ['games', gameId, 'commands']);

  return {
    async send(batch, signal): Promise<TransportOutcome> {
      let response: Response;
      try {
        response = await fetch(address, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(batch),
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        });
      } catch {
        return { kind: 'unanswered' };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const version = VersionRefusal.safeParse(body);
      if (version.success) return { kind: 'version-refused', refusal: version.data };
      if (response.ok) {
        // A page that is not our answer (a gym Wi-Fi sign-in page, say) is no answer.
        const reply = CommandReply.safeParse(body);
        return reply.success ? { kind: 'reply', reply: reply.data } : { kind: 'unanswered' };
      }
      if (tryAgainLater(response.status) || response.status < 400) return { kind: 'unanswered' };
      if (turnedAway(response.status)) return { kind: 'rejected', httpStatus: response.status };
      return { kind: 'batch-refused', httpStatus: response.status };
    },
  };
}
