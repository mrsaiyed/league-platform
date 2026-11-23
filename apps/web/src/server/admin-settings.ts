// What the admin's League settings screen needs from outside (step 2.48): the leagues
// module's own transaction. The settings commands and the list of settings run on it,
// so there is nothing else to read. Season settings (step 2.47) runs the season commands
// on the same transaction with the standings module's stores in it as well (`seasons`):
// saving a season's rules works out what would move in its standings and, once saved,
// works them out again (S-1). container.ts chooses the adapter: the local stand-in
// (stand-in-admin-settings.ts) or the database (database-admin-settings.ts, step 2.93
// part 4).
import type { CommandDeps, LeaguesTx, StandingsTx } from '@srleagues/core';

export type AdminSettingsPorts = {
  /** Runs the settings commands and the list; the context comes from the session (T-23). */
  readonly deps: CommandDeps<LeaguesTx>;
  /** The same, with the standings stores: the season commands (getSeason, setSeasonRules). */
  readonly seasons: CommandDeps<LeaguesTx & StandingsTx>;
};
