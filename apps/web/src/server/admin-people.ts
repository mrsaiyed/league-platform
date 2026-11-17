// What the admin's People screens need from outside (step 2.50): the people module's own
// transaction. The list, one person's record, adding, fixing and removing all run on it
// as the people commands, so every rule (who may see a contact email or a birth date, who
// may change what, the version check) is the product's own. container.ts chooses the
// adapter: the made-up world's people (stand-in-ports.ts), the same rows Admin → Teams
// puts on rosters; or the database's, on Admin → Teams' own transaction
// (database-ports.ts, step 2.50).
import type { CommandDeps, PeopleTx } from '@srleagues/core';
import type { AdminTeamsTx } from './admin-teams.ts';

export type AdminPeoplePorts = {
  /** Runs the people commands and reads; the context comes from the session (T-23). */
  readonly deps: CommandDeps<PeopleTx>;
};

/**
 * Admin → Teams' commands' dependencies, for the people commands: the same transaction
 * (its people store, access, activity log, and the stores core's event handlers need) and
 * the same handlers. A handler is given the whole transaction it was made for; were it
 * ever handed less, it refuses rather than run without its stores.
 */
export function peopleDepsOf(teams: CommandDeps<AdminTeamsTx>): CommandDeps<PeopleTx> {
  const isTeamsTx = (tx: PeopleTx): tx is AdminTeamsTx => 'teams' in tx;
  return {
    ...teams,
    events: teams.events.map((handler) => ({
      type: handler.type,
      handle: async (event, tx) => {
        if (!isTeamsTx(tx)) throw new Error('A people transaction without its teams stores.');
        await handler.handle(event, tx);
      },
    })),
  };
}
