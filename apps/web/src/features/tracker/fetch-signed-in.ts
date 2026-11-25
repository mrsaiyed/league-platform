// "Am I signed in?" (T-456), asked of the one address about no league: true or false
// when the server says so, null when nothing usable came back (no network, a page that
// is not the server's). The tracker asks it only when a league answers "not found".
import { SignedInAnswer, signedInApiPath } from '@srleagues/contracts';

export type SignedInCheck = (signal: AbortSignal) => Promise<boolean | null>;

export function createFetchSignedIn(
  fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): SignedInCheck {
  return async (signal) => {
    try {
      const response = await fetch(signedInApiPath, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
      if (response.status !== 200) return null;
      const read = SignedInAnswer.safeParse(await response.json());
      return read.success ? read.data.signedIn : null;
    } catch {
      return null;
    }
  };
}
