// What a league's pages look like and are called (T-90, P5 §2): its design document and
// its display name. They come from a LeagueSiteSource, a small port. Until the design
// editor exists and saves a design with the league, there is nothing in the database to
// read a design from (the seed leagues of packages/database carry theirs as data), so the
// made-up stand-in below is the only source; the database-backed one arrives with the editor. A league the source does
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
