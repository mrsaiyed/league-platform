// What the admin's People screens need from outside (step 2.50): the people module's own
// transaction. The list, one person's record, adding, fixing and removing all run on it
// as the people commands, so every rule (who may see a contact email or a birth date, who
// may change what, the version check) is the product's own. container.ts chooses the
// adapter: today only the local stand-in fills it (the one made-up world's people, the
// same rows Admin → Teams puts on rosters); on the database it refuses until the part of
// step 2.93 that moves Admin → Teams moves the people store with it.
import type { CommandDeps, PeopleTx } from '@srleagues/core';

export type AdminPeoplePorts = {
  /** Runs the people commands and reads; the context comes from the session (T-23). */
  readonly deps: CommandDeps<PeopleTx>;
};
