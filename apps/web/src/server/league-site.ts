// What a league's pages look like and are called (T-90, P5 §2): its design document and
// its display name. They come from a source by league id, one of the web app's ports
// (`leagueSites`): on the made-up stand-in its made-up leagues' names and designs; on the
// database the league's own name, as its owner saved it (step 2.93 part 3, record 070).
// Until the design editor exists and saves a design with the league (T3's `sites` and
// `site_releases`, not yet in the database), a league on the database has no design of
// its own and gets the neutral starting design; so does a league the source does not
// know, which also takes its short name.
import type { DesignDocument, StartingDesignKey } from '@srleagues/site';
import { startingDesign } from '@srleagues/site';
import { webPorts } from './container.ts';

export type LeagueSite = {
  /** The league's own name, shown first in the header (U-8). It can be in any script (T-188). */
  readonly name: string;
  readonly design: DesignDocument;
};

/** What a source knows of a league: its name, and its design when one is saved. */
export type FoundSite = { readonly name: string; readonly design?: DesignDocument | undefined };

/** Where a league's name and design are read from, by league id. */
export type LeagueSiteSource = (leagueId: string) => FoundSite | undefined;

/** The same, where the answer may have to be read first (the database). */
export type LeagueSiteLookup = (
  leagueId: string,
) => FoundSite | undefined | Promise<FoundSite | undefined>;

const fallbackDesign: StartingDesignKey = 'clean-court';

/** The source a running server draws its leagues' pages from: its ports' own. */
export async function leagueSites(): Promise<LeagueSiteLookup> {
  return (await webPorts()).leagueSites;
}

/** A league's name and design, read from `lookup` (the ports' own, or a stand-in's source). */
export async function siteOf(
  league: { readonly id: string; readonly slug: string },
  lookup: LeagueSiteLookup,
): Promise<LeagueSite> {
  return siteFrom(league, await lookup(league.id));
}

function siteFrom(league: { readonly slug: string }, found: FoundSite | undefined): LeagueSite {
  return {
    name: found?.name ?? league.slug,
    design: found?.design ?? startingDesign(fallbackDesign),
  };
}
