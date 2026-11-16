// Whether the person looking gets "Show this season to visitors" and "Hide it again"
// (step 2.182, A-18): the season command's own permission, `season.settings`, at the
// season's program (the owner and admins), and not in a league that is archived or
// suspended, which the command refuses (U-9). The command checks again; this only hides
// what cannot work, and decides whether "published" points to Season settings.
import { allows, readOnlyStatuses, type AccessHolder, type LeagueStatus } from '@srleagues/core';

export function mayShowSeason(
  holder: AccessHolder | undefined,
  season: { readonly programId: string },
  leagueStatus: LeagueStatus,
): boolean {
  return (
    holder !== undefined &&
    !readOnlyStatuses.includes(leagueStatus) &&
    allows(holder, 'season.settings', { type: 'program', id: season.programId })
  );
}
