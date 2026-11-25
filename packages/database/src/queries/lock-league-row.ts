// T-403 (step 2.243): takes the scope's league row FOR NO KEY UPDATE until the transaction
// ends, so the saves that may record a first child, put one in the bin or give the yes to
// "children in full" (S-109, T-402) run one after another for one league. Always the
// first lock such a save takes, so two of them never wait on each other in turn. Not FOR
// UPDATE: that would also hold up every insert of a row pointing at the league (its
// foreign key takes a key-share lock on this row), such as an activity row, and an
// admin's setting change that inserts one could then deadlock with a guarded save.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function lockLeagueRow(scope: LeagueScope): Promise<string | undefined> {
  const locked = await transactionOf(scope)
    .selectFrom('leagues')
    .select('id')
    .where('id', '=', scope.leagueId)
    .forNoKeyUpdate()
    .executeTakeFirst();
  // The id of the row now held (the isolation harness checks it is the scope's own).
  return locked?.id;
}
