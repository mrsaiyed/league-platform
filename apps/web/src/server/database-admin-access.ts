// The Admins page and the accept page on the database (step 2.97): the access module's
// own transaction, made of packages/database's stores, set to the league and the account
// of the command's context, which comes from the session (T-23, T-28); and the names on
// the access list through the narrow function of step 2.92 (listAccessNames), which
// answers only for the league the transaction is set to.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import type { AccessTx, CommandDeps } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import type { AdminAccessPorts } from './admin-access.ts';
import type { SendQueuedInvitations } from './made-up-invitation-mail.ts';

/** What these ports use of packages/database. */
export type AdminAccessQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'listAccessNames' | 'findActivityTargets'
>;

export function databaseAdminAccess(
  database: AdminAccessQueries,
  db: DatabaseHandle,
  deps: CommandDeps<AccessTx>,
  sendQueuedInvitations: SendQueuedInvitations | null,
): AdminAccessPorts {
  return {
    deps,
    namesOf: (leagueId) =>
      database.withTransaction(db, { leagueId }, async (scope) => {
        const rows = await database.listAccessNames(scope);
        return new Map(rows.map((row) => [row.accountId, row.displayName]));
      }),
    thingsNamed: (leagueId, accountId, asks) =>
      asks.length === 0
        ? Promise.resolve([])
        : database.withTransaction(db, { leagueId, accountId: accountId ?? undefined }, (scope) =>
            database.findActivityTargets(scope, asks),
          ),
    sendQueuedInvitations,
  };
}
