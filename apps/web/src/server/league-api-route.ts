// What every league endpoint's route file calls (T-26): the request's league and
// account from context.ts through resolveLeagueApi, the body read as JSON with a limit,
// and an answer turned into a Response. Next.js's side only; the decisions are in
// league-api.ts and each endpoint's own file, tested without a server.
import { cookies } from 'next/headers';
import { getConfig } from './config.ts';
import { webPorts } from './container.ts';
import type { AccessHolder } from '@srleagues/core';
import type { LeagueRequestContext } from './context.ts';
import { resolveLeagueApi, type ApiAnswer, type ApiRefusal } from './league-api.ts';
import type { WebPorts } from './ports.ts';
import { requestFacts } from './request-facts.ts';
import { cookieNames } from './sign-in/cookies.ts';

export { jsonBody } from './json-body.ts';

/** The request behind `/api/v1/leagues/{leagueId}/{...parts}`, or why there is none. */
export async function leagueEndpoint(
  parts: readonly string[],
  /** A public read sees a session that no longer works as a visitor (league-api.ts). */
  signedOut: 'refuse' | 'visitor' = 'refuse',
): Promise<
  | {
      readonly ok: true;
      readonly context: LeagueRequestContext;
      /** What the account holds in the league, read once by the gate; undefined for a visitor. */
      readonly holder: AccessHolder | undefined;
      readonly ports: WebPorts;
    }
  | { readonly ok: false; readonly refusal: ApiRefusal }
> {
  const ports = await webPorts();
  const facts = await requestFacts(ports);
  const resolved = await resolveLeagueApi(
    facts,
    parts,
    {
      ...ports,
      siteOrigin: getConfig().PUBLIC_BASE_URL,
    },
    signedOut,
  );
  return resolved.ok
    ? { ok: true, context: resolved.context, holder: resolved.holder, ports }
    : resolved;
}

/**
 * Whether the request carried a sign-in cookie: a session, or the renewing token the
 * proxy may have just used to set new cookies on this request's answer (proxy.ts).
 */
export async function carriesSignInCookies(): Promise<boolean> {
  const jar = await cookies();
  return [cookieNames.session, cookieNames.renew].some((name) => jar.has(name));
}

/**
 * An answer as Next.js sends it; never cached unless the answer says so. Every league
 * answer, in every league and in production too, asks search engines not to index it
 * (record 107, T-312): a JSON answer is data for our own pages, and some (the game
 * snapshot) carry players' names at an address a page shows. A page carries the mark in
 * its head instead (league-search-marks.ts); an answer has no head, so it is the header.
 */
export function respond(answer: ApiAnswer): Response {
  return Response.json(answer.body, {
    status: answer.status,
    headers: { 'Cache-Control': 'no-store', ...answer.headers, 'X-Robots-Tag': 'noindex' },
  });
}
