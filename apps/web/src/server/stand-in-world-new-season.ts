// "Start a new season" in the made-up world (step 2.130), as the database does it
// (insert-season.ts, find-current-season-id.ts, copy-season-setup.ts, T-378): a new
// season is a draft with the starting rules and no statistics; the copy takes the old
// season's rules and statistics (not its settings: record 065), its divisions (their tree,
// colors and order; a child of a division in the bin stays behind) and, if asked, its
// teams (each keeping its lineage; none in the bin or that left) and their rosters (the
// players still on them and not in the bin, numbers, roles and order kept, no joining
// date, none waiting for review). Games, rounds and the schedule are never copied.
import type { NewSeason, SeasonSetupCopied, SeasonSetupCopy } from '@srleagues/core';
import type { LeagueWorld, WorldDivision } from './stand-in-world-state.ts';
import { newId } from './stand-in-world-ids.ts';

export function createWorldSeason(s: LeagueWorld, season: NewSeason): string | 'slug-taken' {
  const sameProgram = s.seasons.filter((x) => x.programId === season.programId);
  if (sameProgram.some((x) => x.slug === season.slug)) return 'slug-taken';
  const id = newId();
  s.seasons = [
    ...s.seasons,
    {
      id,
      programId: season.programId,
      programSlug: sameProgram[0]?.programSlug ?? s.seasons[0]?.programSlug ?? s.slug,
      name: season.name,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      slug: season.slug,
      status: 'draft',
      rules: { version: 1 },
      statKeys: [],
      version: 1,
    },
  ];
  return id;
}

/** The program's current season: the world keeps one current season for the league. */
export function currentWorldSeasonOf(s: LeagueWorld, programId: string): string | undefined {
  const current = s.seasons.find((x) => x.id === s.currentSeasonId);
  return current !== undefined && current.programId === programId ? current.id : undefined;
}

export function copyWorldSeasonSetup(s: LeagueWorld, copy: SeasonSetupCopy): SeasonSetupCopied {
  const from = s.seasons.find((x) => x.id === copy.fromSeasonId);
  if (from === undefined) throw new Error('The season to copy from is not in the world.');
  s.seasons = s.seasons.map((x) =>
    x.id === copy.toSeasonId ? { ...x, rules: from.rules, statKeys: [...from.statKeys] } : x,
  );

  // Parents before their children, so each copy can name its parent's copy.
  const divisionCopy = new Map<string, string>();
  let waiting = s.divisions
    .filter((d) => d.seasonId === copy.fromSeasonId && !d.binned)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const made: WorldDivision[] = [];
  while (waiting.length > 0) {
    const ready = waiting.filter(
      (d) => d.parentDivisionId === null || divisionCopy.has(d.parentDivisionId),
    );
    if (ready.length === 0) break;
    for (const division of ready) {
      const id = newId();
      divisionCopy.set(division.id, id);
      made.push({
        ...division,
        id,
        seasonId: copy.toSeasonId,
        parentDivisionId:
          division.parentDivisionId === null
            ? null
            : (divisionCopy.get(division.parentDivisionId) ?? null),
        version: 1,
      });
    }
    waiting = waiting.filter((d) => !divisionCopy.has(d.id));
  }
  s.divisions = [...s.divisions, ...made];

  let teams = 0;
  let rosterEntries = 0;
  if (copy.teams) {
    const binnedPeople = new Set(s.people.filter((p) => p.binned).map((p) => p.id));
    const oldTeams = s.teams
      .filter((t) => t.seasonId === copy.fromSeasonId && !t.binned && !t.left)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const team of oldTeams) {
      const id = newId();
      s.teams = [
        ...s.teams,
        {
          ...team,
          id,
          seasonId: copy.toSeasonId,
          divisionId: team.divisionId === null ? null : (divisionCopy.get(team.divisionId) ?? null),
          version: 1,
        },
      ];
      teams += 1;
      if (!copy.rosters) continue;
      const entries = s.roster
        .filter((r) => r.teamId === team.id && r.leftOn === null && !binnedPeople.has(r.personId))
        .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
      s.roster = [
        ...s.roster,
        ...entries.map((entry) => ({
          ...entry,
          id: newId(),
          teamId: id,
          joinedOn: null,
          addedAtGameId: null,
          needsReview: false,
          version: 1,
        })),
      ];
      rosterEntries += entries.length;
    }
  }
  return { divisions: divisionCopy.size, teams, rosterEntries };
}
