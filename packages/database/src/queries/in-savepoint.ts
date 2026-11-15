// Runs one write of the scope's transaction in a savepoint of its own (record 058): if
// the database turns it away (a number already worn, an id already taken), only that
// write is rolled back and the transaction carries on, so the rest of a tracker's batch
// is still saved. Any other error is rolled back the same way and thrown on.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function inSavepoint<T>(scope: LeagueScope, work: () => Promise<T>): Promise<T> {
  const tx = transactionOf(scope);
  await sql`savepoint table_player`.execute(tx);
  try {
    const value = await work();
    await sql`release savepoint table_player`.execute(tx);
    return value;
  } catch (error) {
    await sql`rollback to savepoint table_player`.execute(tx);
    await sql`release savepoint table_player`.execute(tx);
    throw error;
  }
}
