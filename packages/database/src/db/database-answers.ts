// The web app's health check asks this (T8 §7, step 2.93's last part): whether the
// database answers right now, through the same guarded transaction every read uses, as
// the app's restricted role with no league and no account set. It reads no table, so it
// names no league and no person; a fault is answered `false`, never its message (the
// driver's may hold the address).
import { sql } from 'kysely';
import type { DatabaseHandle } from './database-handle.ts';
import { transactionOf } from './transaction-scope.ts';
import { withTransaction } from './with-transaction.ts';

export async function databaseAnswers(db: DatabaseHandle): Promise<boolean> {
  try {
    const answer = await withTransaction(db, {}, (scope) =>
      sql<{ answer: number }>`select 1 as answer`.execute(transactionOf(scope)),
    );
    return answer.rows[0]?.answer === 1;
  } catch {
    return false;
  }
}
