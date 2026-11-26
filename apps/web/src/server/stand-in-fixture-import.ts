// THE FIXTURE IMPORT SCREEN'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The fixture import (step 2.54) on the one made-up world (stand-in-world.ts): the real
// imports commands run on its rows, a file's names are matched to the season's own teams
// and the league's own venues, and an applied import fills the same schedule draft that
// Admin → Schedule publishes. The worker's part, reading an uploaded file once
// (`imports.run`), is done by the world right after the upload's transaction is kept.
import { getScheduleDraft } from '@srleagues/core';
import type { FixtureImportPorts, ImportNames } from './fixture-import-ports.ts';
import type { World } from './stand-in-world.ts';

export function standInFixtureImport(world: World): FixtureImportPorts {
  return {
    deps: world.deps,
    // The season a league's fixtures are imported into: its current one.
    currentSeasonOf: async (leagueId) => {
      const s = await world.read(leagueId);
      const season = s?.seasons.find((x) => x.id === s.currentSeasonId);
      return season === undefined ? undefined : { id: season.id, name: season.name };
    },
    namesOf: async (leagueId, seasonId): Promise<ImportNames> => {
      const s = await world.read(leagueId);
      if (s === undefined || !s.seasons.some((x) => x.id === seasonId)) {
        return { teams: {}, venues: {} };
      }
      return {
        teams: Object.fromEntries(
          s.teams.filter((t) => t.seasonId === seasonId).map((t) => [t.id, t.name]),
        ),
        venues: Object.fromEntries(s.venues.map((v) => [v.id, v.name])),
      };
    },
    // The draft read itself (step 2.227): its own rule decides who is told the count.
    draftChangeCount: async (context, seasonId) => {
      const read = await getScheduleDraft(context, { seasonId }, world.deps);
      return read.ok ? (read.value.draft?.savedEdits ?? 0) : 0;
    },
  };
}
