// The transaction port of core's removeDraftLeague (step 2.150, record 063): one
// transaction of the MIGRATION login, set to the context's league and account the
// way withTransaction sets the app's (app.league_id, app.account_id), but not
// switched to app_user. The removal is the one thing here nothing else may do:
// app_user may not delete a league (0005) nor history (T-45), and remove_draft_league
// (0017) runs only for the tables' owner and only for the league and account this
// transaction is set to. Our staff member is staff for this run only, in memory
// (`platformStaff`), as the maker names them (record 057): no grant is written.
import type { LeagueRemovalTx, TransactionRunner } from '@srleagues/core';
import type { MigrationDriver } from '../migrations/index.ts';
import { leagueRemovalStore } from './league-removal-store.ts';

export function removalTransaction(
  login: MigrationDriver,
  platformStaff: readonly string[],
): TransactionRunner<LeagueRemovalTx> {
  return (context, work) =>
    login.transaction(async (session) => {
      await session.query(
        "select set_config('app.league_id', $1, true), set_config('app.account_id', $2, true)",
        [context.leagueId, context.accountId ?? ''],
      );
      return work({
        jobs: {
          enqueue: async () => {
            throw new Error('Removing a league records no jobs.');
          },
        },
        leagues: {
          isPlatformStaff: async () =>
            context.accountId !== null && platformStaff.includes(context.accountId),
        },
        leagueRemoval: leagueRemovalStore(session),
      });
    });
}
