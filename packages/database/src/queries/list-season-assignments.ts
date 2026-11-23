// A season's games still to be decided (not final, forfeit or cancelled), not in the bin,
// soonest first (those with no time last), with who is assigned to score each, in the
// order they were assigned: Admin → Games → Scorekeepers (step 2.56). Both reads keep to
// the scope's league.
import type { SeasonAssignments } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameSummary, gameSummaryColumns } from './game-summary.ts';

export async function listSeasonAssignments(
  scope: LeagueScope,
  seasonId: string,
): Promise<SeasonAssignments> {
  const tx = transactionOf(scope);
  const rows = await tx
    .selectFrom('games')
    .select(gameSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['final', 'forfeit', 'cancelled'])
    .orderBy('starts_at', (o) => o.asc().nullsLast())
    .orderBy('id')
    .execute();
  const ids = rows.map((row) => row.id);
  const assignments =
    ids.length === 0
      ? []
      : await tx
          .selectFrom('game_assignments')
          .select(['game_id', 'account_id'])
          .where('league_id', '=', scope.leagueId)
          .where('game_id', 'in', ids)
          .orderBy('created_at')
          .orderBy('id')
          .execute();
  return {
    games: rows.map(gameSummary),
    assignments: assignments.map((row) => ({ gameId: row.game_id, accountId: row.account_id })),
  };
}
