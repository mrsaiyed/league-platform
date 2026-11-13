// The transaction port of core's commands (T-23), supplied here (T-21): each command
// call gets one withTransaction for its context's league and account, and the
// stores `makeTx` binds to that transaction's scope. The apps choose the stores.
import type { CommandTx, TransactionRunner } from '@srleagues/core';
import type { DatabaseHandle } from './database-handle.ts';
import type { LeagueScope } from './transaction-scope.ts';
import { withTransaction } from './with-transaction.ts';

export function commandTransaction<Tx extends CommandTx>(
  db: DatabaseHandle,
  makeTx: (scope: LeagueScope) => Tx,
): TransactionRunner<Tx> {
  return (context, work) =>
    withTransaction(
      db,
      { leagueId: context.leagueId, accountId: context.accountId ?? undefined },
      (scope) => work(makeTx(scope)),
    );
}
