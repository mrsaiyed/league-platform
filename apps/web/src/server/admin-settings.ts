// What the admin's League settings screen needs from outside (step 2.48): the leagues
// module's own transaction. The settings commands and the list of settings run on it,
// so there is nothing else to read. container.ts chooses the adapter; today only the
// local stand-in (stand-in-admin-settings.ts) fills it.
import type { CommandDeps, LeaguesTx } from '@srleagues/core';

export type AdminSettingsPorts = {
  /** Runs the settings commands and the list; the context comes from the session (T-23). */
  readonly deps: CommandDeps<LeaguesTx>;
};
