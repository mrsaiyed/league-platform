// Gives a game of the scope's league its own format, or takes it away (null), if it is
// still at `version` (T-46; the database adds one to the version itself), not in the bin,
// scheduled or postponed, and has no rules fixed (step 2.119). Migration 0026 refuses a
// change to a started game's given format whatever this says.
import type { GameFormatRules } from '@srleagues/contracts';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The new version, or undefined if the game is not there, in the bin, under way or moved on. */
export async function updateGameGivenFormat(
  scope: LeagueScope,
  gameId: string,
  format: GameFormatRules | null,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('games')
    .set({
      given_format: format === null ? null : sql<null>`${JSON.stringify(format)}::jsonb`,
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['scheduled', 'postponed'])
    .where('format', 'is', null)
    .where('format_fixed_at', 'is', null)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
