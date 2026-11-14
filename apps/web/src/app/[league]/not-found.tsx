import { LeagueNotFound, PlatformNotFound } from '../../features/shell/index.ts';
import { leagueViewOfAddress } from '../../server/load-league-page.ts';

/**
 * A page under a league's address that is not there. When the league may be shown to this
 * person (the league layout has drawn its frame), the message sits inside that frame and
 * leads back to the league home. When it may not (no such league, or one hidden from this
 * person), this is exactly the screen an address of no league gets, so a hidden league is
 * never given away (U-9).
 */
export default async function NotFoundInLeague() {
  const view = await leagueViewOfAddress();
  return view === null ? <PlatformNotFound /> : <LeagueNotFound league={view.context.league} />;
}
