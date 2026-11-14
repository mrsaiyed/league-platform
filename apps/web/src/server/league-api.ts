// What a league's JSON endpoint (T-26, record 017) gets before it does anything: the
// request's league and account from context.ts (T-23, T-25), and nothing from the body.
// A plain function of the request's facts, tested without a server.
//
// - The address must be exactly the one the address helper builds for this endpoint
//   (leagueApiUrl, T-34) from the league the context found and the route's own parts.
//   They differ only when the proxy did not run and the path header came from the
//   browser, or the address was spelled another way; either is "not found", as for
//   pages (league-gate.ts, addressMatchesRoute).
// - A league that is not there, or is in the bin, is "not found".
// - A session cookie that no longer works is "signed out" (401): the proxy renews a
//   session before any endpoint sees it, so one still failing here has ended. A public
//   read (the snapshot) treats it as a visitor instead, as pages do.
// - A live session that is none of our accounts' (an AccountRefusal, record 055) is
//   "account problem" (403), or a visitor for a public read; signing in again would
//   not help, and the account page says why.
import { leagueApiUrl, type AccessHolder } from '@srleagues/core';
import {
  requestContext,
  type ContextDeps,
  type LeagueRequestContext,
  type RequestFacts,
} from './context.ts';

/** The JSON answer an endpoint gives: its status and body, and headers beside them. */
export type ApiAnswer = {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ApiRefusal =
  | { readonly status: 401; readonly error: 'signed-out' }
  | { readonly status: 403; readonly error: 'account-problem' }
  | { readonly status: 404; readonly error: 'not-found' };

export const refusalAnswer = (refusal: ApiRefusal): ApiAnswer => ({
  status: refusal.status,
  body: { error: refusal.error },
});

const notFound: ApiRefusal = { status: 404, error: 'not-found' };

/** The path of the address as it arrived, without its query. */
const pathOnly = (path: string) => path.split(/[?#]/)[0] ?? '';

/**
 * The league request behind an endpoint at `/api/v1/leagues/{leagueId}/{...parts}`,
 * or why there is none.
 */
export async function resolveLeagueApi(
  facts: RequestFacts,
  parts: readonly string[],
  deps: ContextDeps,
  /**
   * What a session cookie that no longer works means: "signed out" for commands and
   * session requests, or, for a public read, a visitor, as for pages (league-gate.ts).
   */
  signedOut: 'refuse' | 'visitor' = 'refuse',
): Promise<
  | { readonly ok: true; readonly context: LeagueRequestContext }
  | { readonly ok: false; readonly refusal: ApiRefusal }
> {
  const built = await requestContext(facts, deps);
  if (!built.ok) {
    const code = built.error.code;
    const accountProblem = code === 'account-problem';
    if (code !== 'renew-session' && code !== 'session-ended' && !accountProblem) {
      return { ok: false, refusal: notFound };
    }
    if (signedOut === 'visitor' && facts.session !== null) {
      return resolveLeagueApi({ ...facts, session: null }, parts, deps, signedOut);
    }
    if (accountProblem) return { ok: false, refusal: { status: 403, error: 'account-problem' } };
    return { ok: false, refusal: { status: 401, error: 'signed-out' } };
  }
  const context = built.value;
  if (context.kind !== 'league') return { ok: false, refusal: notFound };
  let expected: string;
  try {
    expected = leagueApiUrl({ id: context.league.id }, parts);
  } catch {
    return { ok: false, refusal: notFound };
  }
  if (pathOnly(facts.path) !== expected) return { ok: false, refusal: notFound };
  return { ok: true, context };
}

/** A game's id as an address part: a UUID, in lower case as the database spells it. */
const gameIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isGameIdFormat = (value: string): boolean => gameIdPattern.test(value);

/** What an endpoint is handed once its request is resolved. */
export type LeagueApiRequest = {
  readonly context: LeagueRequestContext;
  /** What the account holds in the league, read fresh (T-75); undefined for a visitor. */
  readonly holder: AccessHolder | undefined;
};
