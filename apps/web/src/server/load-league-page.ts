// What every league page and layout calls first. The request is worked out once
// (league-gate.ts: one request id, one read of the person's access), then each
// layout and page gets its own answer.
//
// Pages call loadLeaguePage, which turns a refusal into Next.js's own: "not found"
// (404), a permanent forward (308) or "you do not have access" (403, forbidden.tsx);
// a session that is none of our accounts' goes to the account page (record 055).
// Every page calls it, not only the layouts: Next.js does not draw a layout again
// when moving between pages under it, so a check in a layout alone could be passed by.
//
// Layouts call leagueView, which never refuses: it gives nothing when the page may
// not be shown, and the layout then draws only the page, whose own refusal replaces
// it. A refusal thrown by a layout would make Next.js send a blank page that only
// the browser's script fills in.
//
// Both are given the route's `[league]` value. When it is not the league of the
// address the proxy wrote down, the proxy did not run for this request, and the
// answer is "not found" (league-gate.ts, addressMatchesRoute).
import { holdsAnywhere, roles, type AdminArea, type Permission, type Role } from '@srleagues/core';
import { headers } from 'next/headers';
import { forbidden, notFound, permanentRedirect, redirect } from 'next/navigation';
import { cache } from 'react';
import { getConfig } from './config.ts';
import { signInFirstUrl } from './sign-in-first.ts';
import { screenUrl, type Problem } from './sign-in/problems.ts';
import { webPorts } from './container.ts';
import {
  addressMatchesRoute,
  leaguePageOutcome,
  resolveLeagueRequest,
  type LeagueOutcome,
  type LeagueView,
  type LeagueWant,
  type ResolvedLeagueRequest,
} from './league-gate.ts';
import { pathHeader } from './request-facts-header.ts';
import { thisRequestFacts } from './this-request.ts';

/** This request, worked out once however many layouts and pages ask (React cache). */
const resolvedRequest = cache(
  async (): Promise<{
    readonly path: string;
    readonly resolved: ResolvedLeagueRequest;
    readonly email: string | null;
  }> => {
    const ports = await webPorts();
    const facts = await thisRequestFacts();
    const resolved = await resolveLeagueRequest(facts, {
      ...ports,
      siteOrigin: getConfig().PUBLIC_BASE_URL,
    });
    // The address the sign-in service holds for the session, only when the request was
    // worked out as that person's (a session that ran out is drawn as a visitor's).
    const signedIn = resolved.kind === 'league' && resolved.context.account !== null;
    const email = signedIn && facts.session?.ok === true ? facts.session.value.email : null;
    return { path: facts.path, resolved, email };
  },
);

async function outcomeFor(
  routeLeague: string,
  page: LeagueWant['page'],
  area: AdminArea | null,
): Promise<LeagueOutcome> {
  const { path, resolved } = await resolvedRequest();
  if (!addressMatchesRoute(path, routeLeague)) return { kind: 'not-found' };
  const want: LeagueWant = page === 'admin' ? { page, area } : { page };
  return leaguePageOutcome(resolved, want);
}

/**
 * For a page someone not signed in can only be meant to sign in for (U-15): instead of
 * "you do not have access", they are sent to sign in and brought back to this address,
 * with `problem` shown on the sign-in screen if given. Every admin page does this without
 * being asked (U-15, changed November 17: every address of the admin, not only its home);
 * the tracker asks, with its own problem. Someone signed in without the access is still
 * refused (U-6) and never sent to sign in, and a league hidden from them is still "not
 * found", the gate's answer, which comes first. A form posted to an admin page by someone
 * signed out is sent to sign in before anything is written.
 */
export type VisitorSignsIn = { readonly problem?: Problem };

/** For a page: the view, or Next.js's refusal. `routeLeague` is the route's `[league]`. */
export async function loadLeaguePage(
  routeLeague: string,
  page: LeagueWant['page'],
  area: AdminArea | null = null,
  visitorSignsIn?: VisitorSignsIn,
): Promise<LeagueView> {
  const outcome = await outcomeFor(routeLeague, page, area);
  switch (outcome.kind) {
    case 'show':
      return outcome.view;
    case 'forward':
      return permanentRedirect(outcome.to);
    case 'no-access':
      if ((visitorSignsIn !== undefined || page === 'admin') && !outcome.signedIn) {
        const { path } = await resolvedRequest();
        return redirect(signInFirstUrl(path, visitorSignsIn ?? {}));
      }
      return forbidden();
    case 'not-found':
      return notFound();
    case 'account-problem': {
      // The account page explains; its name screen (step 2.128) comes back to this page.
      const { path } = await resolvedRequest();
      return redirect(screenUrl('account', { next: path }));
    }
  }
}

/**
 * For the league's own "not found" screen (`[league]/not-found.tsx`), which Next.js gives no
 * route values: the league of the address the proxy wrote down, when its public pages may be
 * shown to this person, else null. It is the same worked-out request the league layout
 * used, so the screen agrees with the frame around it. Never used to decide access: the
 * page has already refused.
 */
export async function leagueViewOfAddress(): Promise<LeagueView | null> {
  const { resolved } = await resolvedRequest();
  const outcome = leaguePageOutcome(resolved, { page: 'site' });
  return outcome.kind === 'show' ? outcome.view : null;
}

/**
 * For "not found" inside the admin (`[league]/admin/not-found.tsx`, step 2.103): the league
 * of the address the proxy wrote down, when its admin is open to this person, else null. It
 * is the same worked-out request the admin's layout used, so the screen agrees with the
 * frame around it. Never used to decide access: the page has already refused.
 */
export async function staffViewOfAddress(): Promise<LeagueView | null> {
  const { resolved } = await resolvedRequest();
  const outcome = leaguePageOutcome(resolved, { page: 'admin', area: null });
  return outcome.kind === 'show' ? outcome.view : null;
}

/**
 * For "not found" at a game's scoring address (`[league]/score/[game]/not-found.tsx`, step
 * 2.157): the league of the address the proxy wrote down, when this person may score
 * there, else null. The same worked-out request the page used; never used to decide access.
 */
export async function scorerViewOfAddress(): Promise<LeagueView | null> {
  const { resolved } = await resolvedRequest();
  const outcome = leaguePageOutcome(resolved, { page: 'score' });
  return outcome.kind === 'show' ? outcome.view : null;
}

/**
 * For the account button (U-8) and the refusal page: the address the signed-in person is
 * signed in with, as the sign-in service holds it; null for a visitor. Drawn for this
 * request only: the pages it appears on are drawn per request (record 066).
 */
export async function signedInEmail(): Promise<string | null> {
  // The refusal screen asks on every page (Next.js draws it into each one): a session
  // that cannot be read just now is drawn as a visitor's, never as someone else, and
  // never breaks a page that does not touch a league.
  try {
    return (await resolvedRequest()).email;
  } catch {
    return null;
  }
}

/** The address of this request as it arrived, for a way back to it after signing in. */
export async function requestPath(): Promise<string> {
  // Read from the proxy's header alone, so it never waits on (or fails with) the session.
  return (await headers()).get(pathHeader) ?? '';
}

/**
 * Whether the person of this request holds `permission` anywhere in the league of the
 * address (step 2.157): so a page offers no form that could only be refused (a club admin,
 * who may not add a person to the league, is not offered "Someone not in the list yet").
 * It reads what the gate already read for this request, and decides nothing: the command
 * behind the form still checks, and refuses a post sent by hand.
 */
export async function holdsHere(permission: Permission): Promise<boolean> {
  const { resolved } = await resolvedRequest();
  return resolved.kind === 'league' && holdsAnywhere(resolved.holder, permission);
}

/**
 * The roles the person of this request holds in the league of the address, in the roles'
 * own order, each once (step 2.157): what the refusal names to staff, "You are a scheduler
 * in this league." Only their own, as the gate read them for this request; empty for a
 * visitor, the owner (not a grant) or a league that is not shown to them. Decides nothing.
 */
export async function rolesHere(): Promise<readonly Role[]> {
  const { resolved } = await resolvedRequest();
  if (resolved.kind !== 'league' || resolved.holder === undefined) return [];
  const holder = resolved.holder;
  const held = new Set(
    holder.grants
      .filter((grant) => grant.accountId === holder.accountId && grant.revokedAt === null)
      .map((grant) => grant.role),
  );
  return roles.filter((role) => held.has(role));
}

/** For a layout: the view when the page may be shown, else null (the page refuses). */
export async function leagueView(
  routeLeague: string,
  page: LeagueWant['page'],
  area: AdminArea | null = null,
): Promise<LeagueView | null> {
  const outcome = await outcomeFor(routeLeague, page, area);
  return outcome.kind === 'show' ? outcome.view : null;
}
