// What a league's pages look like and are called (T-90, P5 §2): its design document and
// its display name. They come from a LeagueSiteSource, a small port. TODO (step 1.21):
// replace the made-up stand-in below with the database-backed source, where the design
// editor's saved design and the league's real name are read. A league the source does
// not know gets the neutral starting design and its short name.
import type { DesignDocument, StartingDesignKey } from '@srleagues/site';
import { startingDesign } from '@srleagues/site';
import { standInLeagueSites } from './stand-in-league-sites.ts';

export type LeagueSite = {
  /** The league's own name, shown first in the header (U-8). It can be in any script (T-188). */
  readonly name: string;
  readonly design: DesignDocument;
};

/** Where a league's name and starting design are read from, by league id. */
export type LeagueSiteSource = (
  leagueId: string,
) => { readonly name: string; readonly design: StartingDesignKey } | undefined;

const fallbackDesign: StartingDesignKey = 'clean-court';

// TODO (step 1.21): wire the real source here instead of the made-up one.
export function siteOfLeague(
  league: { readonly id: string; readonly slug: string },
  source: LeagueSiteSource = standInLeagueSites,
): LeagueSite {
  const found = source(league.id);
  return {
    name: found?.name ?? league.slug,
    design: startingDesign(found?.design ?? fallbackDesign),
  };
}
