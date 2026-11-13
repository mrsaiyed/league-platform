// The made-up names and designs of the stand-in leagues. FOR LOCAL WORK AND TESTS ONLY.
import type { StartingDesignKey } from '@srleagues/site';
import { standInLeagues } from './stand-in-ports.ts';
import type { LeagueSiteSource } from './league-site.ts';

const madeUp: Readonly<Record<string, { name: string; design: StartingDesignKey }>> = {
  [standInLeagues.live.id]: { name: 'North Valley League', design: 'midnight-gold' },
  [standInLeagues.other.id]: { name: 'Harbor City League', design: 'clean-court' },
};

export const standInLeagueSites: LeagueSiteSource = (leagueId) =>
  Object.hasOwn(madeUp, leagueId) ? madeUp[leagueId] : undefined;
