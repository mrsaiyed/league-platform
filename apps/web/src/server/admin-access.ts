// What the admin's Admins page and the invitation's accept page need from outside (step
// 2.97, P4 §4 and §6): the access module's own transaction, where inviting, re-sending,
// cancelling, removing access, accepting and the reads all run, so every rule (who may
// give which role where, one open invitation per person, role and place, a link used
// once) is the product's own; and the names on the access list. container.ts chooses the
// adapter: the stand-in (stand-in-admin-access.ts) or the database
// (database-admin-access.ts).
import type { AccessTx, CommandDeps } from '@srleagues/core';
import type { LogThingAsk, LogThingName } from '../features/access-area/activity-log-view.ts';
import type { SendQueuedInvitations } from './made-up-invitation-mail.ts';

export type AdminAccessPorts = {
  /** Runs the access commands and reads; the context comes from the session (T-23). */
  readonly deps: CommandDeps<AccessTx>;
  /**
   * The name each account on the league's access list has given (its owner and everyone
   * holding a grant in force), null for one that has given none (A-14: "No name yet").
   * Read with no account set: the page asks only after the access module's own list
   * (access.list_access) let the person see who has access.
   */
  readonly namesOf: (leagueId: string) => Promise<ReadonlyMap<string, string | null>>;
  /**
   * What one page of the activity log points at, named as it is now, in one read of the
   * league, things in the bin too (step 2.77). Read as the session's account, after the
   * log's own read (access.search_activity) let the person see the entries.
   */
  readonly thingsNamed: (
    leagueId: string,
    accountId: string | null,
    asks: readonly LogThingAsk[],
  ) => Promise<readonly LogThingName[]>;
  /**
   * The worker's turn on the made-up database (made-up-invitation-mail.ts): sends the
   * invitation emails just queued. Null everywhere else: the worker sends them.
   */
  readonly sendQueuedInvitations: SendQueuedInvitations | null;
};
