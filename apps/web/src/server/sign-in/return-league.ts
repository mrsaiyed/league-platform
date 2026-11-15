// The league a sign-in screen was opened from (step 2.127; the using-it audit, M22): the
// screen names it and offers "Back to {league}". The page to come back to has already
// been through safeReturnPath, so it is a path on this site; here it is worked out as if
// this person had asked for it (league-gate.ts), so a league they may not see (a draft,
// to a visitor) gives no name and no way back, exactly as its own page would be "not
// found" (U-9). Never used to decide access: it only names a league already allowed.
import { getConfig } from '../config.ts';
import { webPorts } from '../container.ts';
import type { RequestFacts } from '../context.ts';
import { resolveLeagueRequest, type GateDeps } from '../league-gate.ts';
import { leagueSites, siteOfLeague, type LeagueSiteSource } from '../league-site.ts';
import { thisRequestFacts } from '../this-request.ts';

export type ReturnLeague = {
  /** The league's own name, as its pages show it. */
  readonly name: string;
  /** The page to go back to: the one the person came from. */
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
  sites: LeagueSiteSource,
): Promise<ReturnLeague | null> {
  if (next === null) return null;
  const resolved = await resolveLeagueRequest({ ...facts, path: next }, deps);
  if (resolved.kind !== 'league') return null;
  return { name: siteOfLeague(resolved.context.league, sites).name, href: next };
}

/** The league of `next` for the person of this request. */
export async function returnLeagueOf(next: string | null): Promise<ReturnLeague | null> {
  if (next === null) return null;
  return returnLeagueFor(
    next,
    await thisRequestFacts(),
    { ...(await webPorts()), siteOrigin: getConfig().PUBLIC_BASE_URL },
    leagueSites(),
  );
}
