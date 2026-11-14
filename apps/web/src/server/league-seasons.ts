// The seasons of a league that the public may pick, read once for a request however many
// places ask (React cache): the header's season picker in the league layout and the page
// under it.
import { cache } from 'react';
import { webPorts } from './container.ts';
import type { PublicSeason } from './public-stats.ts';

export const seasonsOfLeague = cache(
  async (leagueId: string): Promise<readonly PublicSeason[]> =>
    (await webPorts()).publicStats.seasonsOf(leagueId),
);
