// The queue's way to the server in the browser: one POST of a batch to the game's
// commands endpoint (T6 §3), addressed by the league's id so a queue held across a
// change of short name still arrives (T-229). The answer is sorted into the five
// outcomes the queue knows; nothing here throws.
//
// Only an answer in the contract's shapes is the server's word: the reply, the version
// refusal, or the server's own refusal at its own status (`ownTrackerRefusal`). Anything
// else is no answer and is sent again later, whatever its status: a gym Wi-Fi sign-in
// page, a filter or a host's error page answering 404, 403 or 400 must never halt the
// queue or have taps refused.
import { CommandReply, VersionRefusal, ownTrackerRefusal } from '@srleagues/contracts';
import { leagueApiUrl } from '@srleagues/core';
import type { CommandTransport, TransportOutcome } from './command-transport.ts';

export type FetchCommandTransportOptions = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly fetch?: typeof globalThis.fetch;
};

const unanswered: TransportOutcome = { kind: 'unanswered' };

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
        return unanswered;
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
        const reply = CommandReply.safeParse(body);
        return reply.success ? { kind: 'reply', reply: reply.data } : unanswered;
      }
      const refusal = ownTrackerRefusal(response.status, body);
      if (refusal === null) return unanswered;
      // Not a batch: the queue sends one tap at a time to find the bad one.
      if (refusal.error === 'invalid-input') {
        return { kind: 'batch-refused', httpStatus: response.status };
      }
      // Signed out, not allowed, no such game: the queue halts.
      return { kind: 'rejected', httpStatus: response.status };
    },
  };
}
