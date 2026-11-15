// What a league's pages look like and are called (T-90, P5 §2): its design document and
// its display name. They come from a LeagueSiteSource, a small port. Until the design
// editor exists and saves a design with the league, there is nothing in the database to
// read a design from (the seed leagues of packages/database carry theirs as data), so
// the made-up stand-in below is the only source; the database-backed one arrives with the editor. A league the source does
// not know gets the neutral starting design and its short name.
import type { DesignDocument, StartingDesignKey } from '@srleagues/site';
import { startingDesign } from '@srleagues/site';
import { getConfig } from './config.ts';
import { standInLeagueSites, standInLeagueSitesIn } from './stand-in-league-sites.ts';

export type LeagueSite = {
  /** The league's own name, shown first in the header (U-8). It can be in any script (T-188). */
  readonly name: string;
  readonly design: DesignDocument;
};

/** Where a league's name and design are read from, by league id. */
export type LeagueSiteSource = (
  leagueId: string,
) => { readonly name: string; readonly design: DesignDocument } | undefined;

const fallbackDesign: StartingDesignKey = 'clean-court';

/**
 * The source a running server draws its leagues' pages from: the stand-in's, with the
 * first made-up league under the design the LOCAL_DESIGN setting names when it is set.
 * That setting is refused outside local work and tests (config-schema.ts), as the
 * stand-in itself is, so no real league's look can be changed this way.
 */
export function leagueSites(): LeagueSiteSource {
  const pictured = getConfig().LOCAL_DESIGN;
  return pictured === undefined ? standInLeagueSites : standInLeagueSitesIn(pictured);
}

export function siteOfLeague(
  league: { readonly id: string; readonly slug: string },
  source: LeagueSiteSource = standInLeagueSites,
): LeagueSite {
  const found = source(league.id);
  return {
    name: found?.name ?? league.slug,
    design: found?.design ?? startingDesign(fallbackDesign),
  };
}
