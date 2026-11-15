// The made-up names and designs of the stand-in leagues. FOR LOCAL WORK AND TESTS ONLY.
import { standInLeagues } from './stand-in-cast.ts';
import type { LeagueSiteSource } from './league-site.ts';
import { picturedDesign, type PicturedDesignKey } from './stand-in-designs.ts';

/** The two made-up leagues with a look of their own; their names are the cast's. */
const madeUp: Readonly<Record<string, { name: string; design: PicturedDesignKey }>> = {
  [standInLeagues.live.id]: { name: standInLeagues.live.name, design: 'crest' },
  [standInLeagues.other.id]: { name: standInLeagues.other.name, design: 'clean-court' },
};

/**
 * The stand-in leagues' names and designs. `pictured` (the LOCAL_DESIGN setting, local
 * work and tests only) draws the first made-up league under another design, so that every
 * page can be pictured in every color set (scripts/shots.mjs --design=<name>).
 */
export function standInLeagueSitesIn(pictured?: PicturedDesignKey): LeagueSiteSource {
  return (leagueId) => {
    if (!Object.hasOwn(madeUp, leagueId)) return undefined;
    const found = madeUp[leagueId];
    if (found === undefined) return undefined;
    const key =
      pictured !== undefined && leagueId === standInLeagues.live.id ? pictured : found.design;
    return { name: found.name, design: picturedDesign(key) };
  };
}

export const standInLeagueSites: LeagueSiteSource = standInLeagueSitesIn();
