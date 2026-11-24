// ADMIN → SCHEDULE'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The schedule grid (step 2.52) on the one made-up world (stand-in-world.ts): the
// scheduling module's own commands run on its rows, so a published schedule is the
// season's games everywhere: the public schedule and home page, a game's own page, the
// games area's list and the tracker. The draft is the same one a fixture import fills.
import { mayListSeason } from '@srleagues/core';
import type { ScheduleAdminPorts, ScheduleSeason } from './schedule-admin.ts';
import { worldPublicSeasons } from './stand-in-world-reads.ts';
import type { World } from './stand-in-world.ts';

export function standInSchedule(world: World): ScheduleAdminPorts {
  return {
    deps: world.deps,
    teamsOf: async (leagueId, seasonId) =>
      ((await world.read(leagueId))?.teams ?? [])
        .filter((t) => t.seasonId === seasonId)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(({ id, name, binned, left }) => ({ id, name, removed: binned, left })),
    seasonsOf: async (leagueId, holder) => {
      const s = await world.read(leagueId);
      const all = s?.seasons ?? [];
      const programOf = (id: string) => all.find((x) => x.id === id)?.programId ?? '';
      const shown = worldPublicSeasons(s);
      const hidden = all
        .filter((x) => !shown.some((p) => p.id === x.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((x) => ({
          id: x.id,
          name: x.name,
          slug: x.slug,
          isCurrent: s?.currentSeasonId === x.id,
          isPublic: false,
          programId: x.programId,
          archived: x.status === 'completed',
        }));
      const listed: readonly ScheduleSeason[] = [
        ...shown.map((x) => ({
          ...x,
          isPublic: true,
          programId: programOf(x.id),
          archived: all.some((y) => y.id === x.id && y.status === 'completed'),
        })),
        ...hidden,
      ];
      // Only what this holder may be told of: the scheduling module's one rule (P4 §4).
      return listed.filter((x) => mayListSeason(holder, x));
    },
  };
}
