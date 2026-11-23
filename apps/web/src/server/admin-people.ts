// What the admin's People screens need from outside (step 2.50): the people module's own
// transaction. The list, one person's record, adding, fixing and removing all run on it
// as the people commands, so every rule (who may see a contact email or a birth date, who
// may change what, the version check) is the product's own. container.ts chooses the
// adapter: the made-up world's people (stand-in-ports.ts), the same rows Admin → Teams
// puts on rosters; or the database's, on Admin → Teams' own transaction
// (database-ports.ts, step 2.50).
import type { CommandDeps, PeopleTx, RestoreGameTx } from '@srleagues/core';
import type { AdminTeamsTx } from './admin-teams.ts';
import { coreEventHandlers } from './database-event-handlers.ts';

export type AdminPeoplePorts = {
  /** Runs the people commands and reads; the context comes from the session (T-23). */
  readonly deps: CommandDeps<PeopleTx>;
  /**
   * Runs `leagues.restore_person`, the one way back from "Remove from the league list"
   * (A-5), on the bin's own transaction: its people.manage check is the command's own.
   */
  readonly putBack: CommandDeps<RestoreGameTx>;
};

/**
 * Admin → Teams' commands' dependencies, for the people commands: the same transaction
 * (its people store, access, activity log, and the stores core's event handlers need) and
 * core's handlers, from the one place every database port takes them
 * (database-event-handlers.ts, step 2.93's last part), never a list made here. A handler
 * handed a transaction without the stores it uses refuses rather than run without them.
 */
export function peopleDepsOf(teams: CommandDeps<AdminTeamsTx>): CommandDeps<PeopleTx> {
  return { ...teams, events: coreEventHandlers<PeopleTx>() };
}
