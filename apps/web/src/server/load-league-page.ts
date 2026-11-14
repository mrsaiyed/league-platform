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
import { platformUrl, type AdminArea } from '@srleagues/core';
import { forbidden, notFound, permanentRedirect, redirect } from 'next/navigation';
import { cache } from 'react';
import { getConfig } from './config.ts';
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
import { requestFacts } from './request-facts.ts';

/** This request, worked out once however many layouts and pages ask (React cache). */
const resolvedRequest = cache(
  async (): Promise<{ readonly path: string; readonly resolved: ResolvedLeagueRequest }> => {
    const ports = await webPorts();
    const facts = await requestFacts(ports);
    const resolved = await resolveLeagueRequest(facts, {
      ...ports,
      siteOrigin: getConfig().PUBLIC_BASE_URL,
    });
    return { path: facts.path, resolved };
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

/** For a page: the view, or Next.js's refusal. `routeLeague` is the route's `[league]`. */
export async function loadLeaguePage(
  routeLeague: string,
  page: LeagueWant['page'],
  area: AdminArea | null = null,
): Promise<LeagueView> {
  const outcome = await outcomeFor(routeLeague, page, area);
  switch (outcome.kind) {
    case 'show':
      return outcome.view;
    case 'forward':
      return permanentRedirect(outcome.to);
    case 'no-access':
      return forbidden();
    case 'not-found':
      return notFound();
    case 'account-problem':
      return redirect(platformUrl('account'));
  }
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
