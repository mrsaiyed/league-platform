// What a league's pages look like and are called (T-90, P5 §2): its design document and
// its display name. Made-up for now: the stand-in holds them by league id, so no database
// is read (step 1.21 seeds real ones; the design editor writes them later). A league the
// stand-in does not know gets the neutral starting design and its short name.
import type { DesignDocument, StartingDesignKey } from '@srleagues/site';
import { startingDesign } from '@srleagues/site';
import { standInLeagues } from './stand-in-ports.ts';

export type LeagueSite = {
  /** The league's own name, shown first in the header (U-8). It can be in any script (T-188). */
  readonly name: string;
  readonly design: DesignDocument;
};

const madeUp: Readonly<Record<string, { name: string; design: StartingDesignKey }>> = {
  [standInLeagues.live.id]: { name: 'North Valley League', design: 'midnight-gold' },
  [standInLeagues.other.id]: { name: 'Harbor City League', design: 'clean-court' },
};

const fallbackDesign: StartingDesignKey = 'clean-court';

export function siteOfLeague(league: { readonly id: string; readonly slug: string }): LeagueSite {
  const found = Object.hasOwn(madeUp, league.id) ? madeUp[league.id] : undefined;
  return {
    name: found?.name ?? league.slug,
    design: startingDesign(found?.design ?? fallbackDesign),
  };
}
