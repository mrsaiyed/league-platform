// Whether an address is the tracker's (step 2.35): the league's layout leaves its public
// header, menu and footer, and the league's design, off the tracker's page, so one stray
// tap cannot leave a game, the scoreboard has the whole screen, and nothing a league
// saved reaches the scoring screen (docs/build/DESIGN.md section 7, lines 1 and 11).
import { leagueUrl, type LeagueAddressee } from '@srleagues/core';

/** True for `/{league}/score/{game}`, with or without a query; false for anything under it. */
export function isTrackerAddress(league: LeagueAddressee, path: string): boolean {
  const at = (path.split(/[?#]/)[0] ?? '').replace(/\/+$/, '').toLowerCase();
  const game = 'game';
  // The tracker's address for any game, less the game: built by the one address helper.
  const base = `${leagueUrl(league, 'score', { game })
    .toLowerCase()
    .slice(0, -(game.length + 1))}/`;
  if (!at.startsWith(base)) return false;
  const rest = at.slice(base.length);
  return rest !== '' && !rest.includes('/');
}
