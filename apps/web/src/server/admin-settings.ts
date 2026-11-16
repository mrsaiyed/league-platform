// What the admin's League settings screen needs from outside (step 2.48): the leagues
// module's own transaction. The settings commands and the list of settings run on it,
// so there is nothing else to read. container.ts chooses the adapter: the local stand-in
// (stand-in-admin-settings.ts) or the database (database-admin-settings.ts, step 2.93
// part 4).
import type { CommandDeps, LeaguesTx } from '@srleagues/core';

export type AdminSettingsPorts = {
  /** Runs the settings commands and the list; the context comes from the session (T-23). */
  readonly deps: CommandDeps<LeaguesTx>;
};
