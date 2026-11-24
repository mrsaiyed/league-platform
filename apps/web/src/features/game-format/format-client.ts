// The page's side of `/api/v1/leagues/{leagueId}/games/{game}/format` (step 2.119): read
// a game's format, give it one, or return it to its season's. A reply is the server's
// only with its own body at its own status; anything else, no answer included, is
// `failed`, and the screen says it was not saved.
import {
  ownGameFormatReply,
  type GameFormatRefusal,
  type GameFormatRules,
  type GameFormatView,
} from '@srleagues/contracts';
import { leagueApiUrl } from '@srleagues/core';

export type FormatOutcome =
  | { readonly kind: 'format'; readonly view: GameFormatView }
  | { readonly kind: 'refused'; readonly code: GameFormatRefusal }
  | { readonly kind: 'failed' };

export type GameFormatClient = {
  read(): Promise<FormatOutcome>;
  /** `format` null returns the game to its season's format. */
  change(version: number, format: GameFormatRules | null): Promise<FormatOutcome>;
};

export function createGameFormatClient(options: {
  readonly leagueId: string;
  readonly gameId: string;
  readonly fetch?: typeof globalThis.fetch;
}): GameFormatClient {
  const { leagueId, gameId } = options;
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const url = leagueApiUrl({ id: leagueId }, ['games', gameId, 'format']);

  const call = async (init: RequestInit): Promise<FormatOutcome> => {
    try {
      const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
      const body: unknown = await response.json().catch(() => undefined);
      const reply = ownGameFormatReply(response.status, body);
      if (reply === null) return { kind: 'failed' };
      return reply.status === 'format'
        ? { kind: 'format', view: reply.view }
        : { kind: 'refused', code: reply.code };
    } catch {
      return { kind: 'failed' };
    }
  };

  return {
    read: () => call({ method: 'GET' }),
    change: (version, format) =>
      call({
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, format }),
      }),
  };
}
