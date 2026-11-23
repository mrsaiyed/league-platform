// The invitation's accept page, worked out on the server (step 2.97, P4 §4, T-226, records
// 023 and 086). The emailed link `/{league}/invitation/{token}` only holds its token for
// this browser, in a cookie of its own, and sends the browser to `/{league}/invitation`
// (the address helper's `invitation-held`), which has no secret in it: so the token is in
// no address but the email's, never in the browser's history past the link itself, in the
// way back from signing in (`?next=`), in a Referer, or in a log line of ours.
//
// The cookie is out of the page's scripts' reach (HttpOnly), Secure on HTTPS, sent only to
// the accept page's own addresses (its Path) and only on a plain link followed from
// elsewhere (SameSite=Lax), and gone after an hour or as soon as the invitation is
// accepted. It is read here, on the server, and never drawn into the page.
//
// The page is answered for any league's address the same way, without the league
// gate's "not found" (league-gate.ts): an invitation is usually into a league that is
// not public yet, which the person cannot see until they accept. What it shows a person
// who may not see the league is only what the token proves (access.read_invitation): an
// address with no league behind it, a hidden league, a wrong token, a used, cancelled or
// run-out one all draw the same page, so the address tells nobody which it was. A visitor
// holding a token is asked to sign in at every such address, a league behind it or not,
// since nothing is looked up for them: so a hidden league's short name cannot be tested.
import { leagueUrl, type CommandContext } from '@srleagues/core';
import { cookies } from 'next/headers';
import { webPorts } from './container.ts';
import { requestContext, type LeagueRequestContext } from './context.ts';
import { getConfig } from './config.ts';
import { secureCookies } from './sign-in/next-visit.ts';
import { thisRequestFacts } from './this-request.ts';

/** The cookie that holds an invitation's token for this browser. */
export const heldInvitationCookie = 'srl_invitation';

/** How long the token is held: long enough to sign up, short on a shared computer. */
export const heldInvitationSeconds = 60 * 60;

/** A token as the links carry it (T-226): 43 URL-safe characters. */
const tokenShape = /^[A-Za-z0-9_-]{43}$/;

/** A league's short name as an address part may hold one, before it is looked up. */
const slugShape = /^[a-z0-9][a-z0-9-]{0,62}$/i;

/** The accept page's own address, with no secret in it, for a short name; undefined if none. */
export function heldInvitationPath(slug: string): string | undefined {
  if (!slugShape.test(slug)) return undefined;
  try {
    return leagueUrl({ slug: slug.toLowerCase() }, 'invitation-held');
  } catch {
    return undefined;
  }
}

/** The cookie's settings for one league's accept page. */
export function heldInvitationOptions(path: string, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path,
    maxAge: heldInvitationSeconds,
  };
}

/** The token held for this league's accept page, if it is one of the right shape. */
export async function heldToken(): Promise<string | undefined> {
  const value = (await cookies()).get(heldInvitationCookie)?.value ?? '';
  return tokenShape.test(value) ? value : undefined;
}

export function isTokenShaped(value: string): boolean {
  return tokenShape.test(value);
}

/** Forgets the held token (after it is accepted): only in an action or a route handler. */
export async function forgetHeldToken(slug: string): Promise<void> {
  const path = heldInvitationPath(slug);
  if (path === undefined) return;
  (await cookies()).set(heldInvitationCookie, '', {
    ...heldInvitationOptions(path, secureCookies()),
    maxAge: 0,
  });
}

/** Who is looking at the accept page, and in which league, as the server's session says. */
export type InvitationRequest =
  | {
      readonly kind: 'no-league';
      /** The short name as the address holds it, looked up or not. */
      readonly slug: string;
      /** Nobody is signed in: answered exactly as a visitor to a league that is there. */
      readonly visitor: boolean;
    }
  /** The session is none of our accounts' (record 055): the account page explains. */
  | { readonly kind: 'account-problem' }
  | {
      readonly kind: 'league';
      readonly context: LeagueRequestContext;
      /** The address the sign-in service holds for the session; null for a visitor. */
      readonly email: string | null;
    };

/**
 * This request, read as for any league page (context.ts: the league from the address the
 * proxy wrote down, the person from the session), but not refused for a league the person
 * cannot see: the page itself decides, from the token, what to show.
 */
export async function invitationRequest(): Promise<InvitationRequest> {
  const facts = await thisRequestFacts();
  const ports = await webPorts();
  const deps = { ...ports, siteOrigin: getConfig().PUBLIC_BASE_URL };
  let built = await requestContext(facts, deps);
  let visitor = facts.session === null;
  // A session that ran out or ended is drawn as a visitor's, as on every league page.
  if (!built.ok && (built.error.code === 'renew-session' || built.error.code === 'session-ended')) {
    built = await requestContext({ ...facts, session: null }, deps);
    visitor = true;
  }
  const slug = (facts.path.split(/[?#]/)[0] ?? '').split('/')[1] ?? '';
  if (!built.ok) {
    return built.error.code === 'account-problem'
      ? { kind: 'account-problem' }
      : { kind: 'no-league', slug, visitor };
  }
  const context = built.value;
  if (context.kind !== 'league') return { kind: 'no-league', slug, visitor };
  const email =
    context.account !== null && facts.session?.ok === true ? facts.session.value.email : null;
  return { kind: 'league', context, email };
}

/** The command context of a league request. */
export function contextOfRequest(request: {
  readonly context: LeagueRequestContext;
}): CommandContext {
  return {
    leagueId: request.context.league.id,
    accountId: request.context.account?.accountId ?? null,
    requestId: request.context.requestId,
  };
}
