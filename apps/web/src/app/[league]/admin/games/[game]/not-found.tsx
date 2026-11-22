import { BoxScoreNotFound } from '../../../../../features/games-area/index.ts';
import { LeagueNotFound, PlatformNotFound } from '../../../../../features/shell/index.ts';
import { StaffNotFound } from '../../../../../features/staff/index.ts';
import { leagueViewOfAddress, staffViewOfAddress } from '../../../../../server/load-league-page.ts';

/**
 * A game's box score address that is no game this person can open here (step 2.157): for
 * someone with the admin's Games area it is "Page not found" in the box score's own words,
 * inside the admin's frame, with the way back to the games. For anyone else it is exactly
 * what "not found" inside the admin is (`[league]/admin/not-found.tsx`): the plain screen an
 * address of no league gets when the league may not be shown to them (U-9), so a hidden
 * league is never given away.
 */
export default async function NotFoundAtBoxScore() {
  const view = await leagueViewOfAddress();
  if (view === null) return <PlatformNotFound />;
  const staff = await staffViewOfAddress();
  if (staff === null) return <LeagueNotFound league={view.context.league} />;
  if (staff.areas.includes('games')) return <BoxScoreNotFound league={staff.context.league} />;
  return <StaffNotFound league={staff.context.league} />;
}
