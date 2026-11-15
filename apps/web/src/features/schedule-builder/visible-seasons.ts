// Which seasons Admin → Schedule names to the person looking (step 2.160, P4 §4). A public
// season is anyone's to see. One that is not public yet is named only to someone who may
// read its program's schedule: the same check the scheduling commands make
// (`maySeeSchedule`: `schedule.read` at the season's program), so a scheduler limited to
// one program never learns the names of another program's unpublished seasons.
import { allows, type AccessHolder } from '@srleagues/core';
import type { ScheduleSeason } from '../../server/schedule-admin.ts';

export function visibleSeasons(
  holder: AccessHolder | undefined,
  seasons: readonly ScheduleSeason[],
): readonly ScheduleSeason[] {
  return seasons.filter(
    (s) =>
      s.isPublic ||
      (holder !== undefined &&
        allows(holder, 'schedule.read', { type: 'program', id: s.programId })),
  );
}
