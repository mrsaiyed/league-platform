// Makes a season the current one of its program, and clears the mark from the one
// that was (T3 §12: at most one per program; the database's index refuses two).
// False if the season is not in the scope's league or is in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function setCurrentSeason(scope: LeagueScope, seasonId: string): Promise<boolean> {
  const trx = transactionOf(scope);
  const season = await trx
    .selectFrom('seasons')
    .select('program_id')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (season === undefined) return false;
  await trx
    .updateTable('seasons')
    .set({ is_current: false })
    .where('league_id', '=', scope.leagueId)
    .where('program_id', '=', season.program_id)
    .where('is_current', '=', true)
    .where('id', '<>', seasonId)
    .execute();
  await trx
    .updateTable('seasons')
    .set({ is_current: true })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .execute();
  return true;
}
