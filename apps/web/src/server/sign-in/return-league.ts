// The league a sign-in screen was opened from (step 2.127; the using-it audit, M22): the
// screen names it and offers "Back to {league}". The page to come back to has already
// been through safeReturnPath, so it is a path on this site; here it is worked out as if
// this person had asked for it (league-gate.ts), so a league they may not see (a draft,
// to a visitor) gives no name and no way back, exactly as its own page would be "not
// found" (U-9). Never used to decide access: it only names a league already allowed.
// "Back to {league}" leads to the league's home, never to the page to come back to: that
// page may be the very one that refused the person (an admin page, a coach's "Use another
// account"), and Back must not lead to the refusal again (review of step 2.157). Signing in
// still brings the person to the page they were going to (`next`).
import { leagueUrl } from '@srleagues/core';
import { getConfig } from '../config.ts';
import { webPorts } from '../container.ts';
import type { RequestFacts } from '../context.ts';
import { resolveLeagueRequest, type GateDeps } from '../league-gate.ts';
import { leagueSites, siteOf, type LeagueSiteLookup } from '../league-site.ts';
import { thisRequestFacts } from '../this-request.ts';

export type ReturnLeague = {
  /** The league's own name, as its pages show it. */
  readonly name: string;
  /** The way back: the league's home. */
  readonly href: string;
};

/**
 * The league of `next` (a path already checked by safeReturnPath) for the person of
 * `facts`, if they may see it: the gate's own answer for that address, by that person.
 */
export async function returnLeagueFor(
  next: string | null,
  facts: RequestFacts,
  deps: GateDeps,
  sites: LeagueSiteLookup,
): Promise<ReturnLeague | null> {
  if (next === null) return null;
  const resolved = await resolveLeagueRequest({ ...facts, path: next }, deps);
  if (resolved.kind !== 'league') return null;
  const league = resolved.context.league;
  return { name: (await siteOf(league, sites)).name, href: leagueUrl(league, 'home') };
}

/** The league of `next` for the person of this request. */
export async function returnLeagueOf(next: string | null): Promise<ReturnLeague | null> {
  if (next === null) return null;
  return returnLeagueFor(
    next,
    await thisRequestFacts(),
    { ...(await webPorts()), siteOrigin: getConfig().PUBLIC_BASE_URL },
    await leagueSites(),
  );
}
