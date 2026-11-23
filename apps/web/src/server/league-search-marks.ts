// A league's own "do not index" on its pages (step 2.60, U-10, U-18, record 107): every
// page under a league whose site facts say so (the league asked, or it holds a child)
// carries `<meta name="robots">` in its head, set once by the league's layout, so no
// page of it is missed. It asks more than the test copy's mark (do-not-index.ts): no
// copy kept and no picture indexed either, as children's photos come with names. Pages
// get no `X-Robots-Tag` header per league: the proxy would have to read the league's
// settings for every answer to send it. The league's JSON answers carry a flat
// `X-Robots-Tag: noindex` in every league (league-api-route.ts, T-312, record 107).
import type { SiteFacts } from '@srleagues/core';
import type { Metadata } from 'next';
import { cache } from 'react';
import { webPorts } from './container.ts';

/** The robots directives of a league that is not to be indexed. */
export const leagueKeepOut = {
  index: false,
  follow: false,
  noarchive: true,
  noimageindex: true,
} as const;

/**
 * What a league's layout adds to its pages' head: the mark, or nothing. Next.js merges a
 * page's head shallowly, so a league's `robots` replaces the root layout's whole: one tag,
 * never two. On the test copy the root's own mark (`noindex, nofollow` on every page,
 * record 082) stands alone, the same on a league's pages as on every other page, so the
 * league adds nothing there; it is a whole-site promise the test copy's check pins. In
 * production (no root mark) and on this computer (where the league's mark holds the
 * root's `noindex, nofollow` and more) the league's mark is the one tag when it asks.
 */
export function leagueRobots(facts: SiteFacts, testCopy: boolean): Metadata {
  return facts.doNotIndex && !testCopy ? { robots: leagueKeepOut } : {};
}

/**
 * A league's site facts for this request, read once however many frames ask (React
 * cache, one per request): the layout's head and its notice.
 */
export const siteFactsOfThisRequest = cache(
  async (leagueId: string): Promise<SiteFacts> => (await webPorts()).siteFactsOf(leagueId),
);
