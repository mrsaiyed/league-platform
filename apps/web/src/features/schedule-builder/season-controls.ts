// Which of the grid's controls the person looking gets for one season (step 2.160): edit
// and publish at the season's own program, the scope the scheduling commands check
// (`mayAtSeason`), so a scheduler limited to one program gets the controls on its seasons
// and none on another program's. The commands check again; this only hides what cannot work.
import { mayAtSeason, type AccessHolder } from '@srleagues/core';

export type SeasonControls = { readonly canEdit: boolean; readonly canPublish: boolean };

export function seasonControls(
  holder: AccessHolder | undefined,
  season: { readonly programId: string; readonly archived: boolean },
): SeasonControls {
  // An archived season is read-only for everyone (O-12): its schedule commands refuse.
  if (season.archived) return { canEdit: false, canPublish: false };
  return {
    canEdit: mayAtSeason(holder, 'schedule.edit', season),
    canPublish: mayAtSeason(holder, 'schedule.publish', season),
  };
}
