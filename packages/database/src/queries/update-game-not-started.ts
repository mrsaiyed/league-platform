// Marks a live game not started in the scope's league (S-40, step 2.121; record 061) if
// it is still at `version` (T-46; the database adds one to the version itself): back to
// scheduled, with no score and no rules of its own. Emptying `format` in this same update
// from live to scheduled is the one change to a started game's rules the database
// allows, and it empties `format_fixed_at` with it (migration 0016).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The new version, or undefined if the game is not there, in the bin, not live or moved on. */
export async function updateGameNotStarted(
  scope: LeagueScope,
  gameId: string,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('games')
    .set({ status: 'scheduled', home_score: null, away_score: null, format: null })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'live')
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
