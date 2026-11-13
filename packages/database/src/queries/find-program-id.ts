// The id of one program of the scope's league that is not in the bin: the one asked
// for, or the default program when none is (U-3).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findProgramId(
  scope: LeagueScope,
  programId: string | undefined,
): Promise<string | undefined> {
  const programs = transactionOf(scope)
    .selectFrom('programs')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null);
  const row = await (
    programId === undefined
      ? programs.where('is_default', '=', true)
      : programs.where('id', '=', programId)
  ).executeTakeFirst();
  return row?.id;
}
