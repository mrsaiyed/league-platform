// What the admin's fixture import screen needs from outside (step 2.54): the imports
// commands' dependencies, the season a file is imported into, and the names a page shows
// beside the ids an import's report holds. The league comes from each call's context,
// never from the request body. Today only the made-up stand-in fills it; the
// database-backed one comes with the web app's start on a database (steps 1.14 and 1.15).
import type { CommandDeps, ImportsTx } from '@srleagues/core';

/** The season a league's fixtures are imported into: its current one. */
export type ImportSeason = { readonly id: string; readonly name: string };

/** The words shown beside an import's games: the season's teams and venues by id. */
export type ImportNames = {
  readonly teams: Readonly<Record<string, string>>;
  readonly venues: Readonly<Record<string, string>>;
};

export type FixtureImportPorts = {
  /** What the imports commands run on; the context in each call names the league. */
  readonly deps: CommandDeps<ImportsTx>;
  /** The league's current season, or undefined when it has none yet. */
  readonly currentSeasonOf: (leagueId: string) => Promise<ImportSeason | undefined>;
  readonly namesOf: (leagueId: string, seasonId: string) => Promise<ImportNames>;
  /** How many unpublished changes the season's schedule draft holds (0 with no draft). */
  readonly draftChangeCount: (leagueId: string, seasonId: string) => Promise<number>;
};
