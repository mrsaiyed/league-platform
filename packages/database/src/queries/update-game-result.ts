// Changes a game's result in the scope's league if it is still at `version` (T-46; the
// database adds one to the version itself). `finalized_at` is the time of this
// transaction when the game is now decided, else empty; the rules (`format`) are set
// only if the game has none, since a game keeps the rules it started with (S-1). A
// decided game's result changes only with a correction written in the same transaction
// (S-7): the database refuses it at commit otherwise.
import { sql } from 'kysely';
import type { GameResultChange } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The new version, or undefined if the game is not there, in the bin or moved on. */
export async function updateGameResult(
  scope: LeagueScope,
  gameId: string,
  change: GameResultChange,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('games')
    .set({
      status: change.status,
      home_score: change.homeScore,
      away_score: change.awayScore,
      finalized_at: change.decided ? sql<Date>`now()` : null,
      ...(change.format === undefined
        ? {}
        : { format: sql<null>`coalesce(format, ${JSON.stringify(change.format)}::jsonb)` }),
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .where('deleted_at', 'is', null)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
