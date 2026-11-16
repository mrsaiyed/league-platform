import { LeagueNotFound, PlatformNotFound } from '../../../features/shell/index.ts';
import { StaffNotFound } from '../../../features/staff/index.ts';
import { leagueViewOfAddress, staffViewOfAddress } from '../../../server/load-league-page.ts';

/**
 * A page under the admin's address that is not there: a team, a game or an area. For
 * someone the admin is open to it sits inside the admin's frame and leads back to the
 * admin's home (step 2.103). For anyone else it is exactly what the league's own "not
 * found" is (`[league]/not-found.tsx`): inside the league's frame when the league may be
 * shown, and the plain screen an address of no league gets when it may not (U-9).
 */
export default async function NotFoundInAdmin() {
  const view = await leagueViewOfAddress();
  if (view === null) return <PlatformNotFound />;
  const staff = await staffViewOfAddress();
  return staff === null ? (
    <LeagueNotFound league={view.context.league} />
  ) : (
    <StaffNotFound league={staff.context.league} />
  );
}
