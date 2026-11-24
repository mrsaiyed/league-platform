// For a games list (step 2.177, T-349), in one statement: each of these games of the
// scope's league with who decided it by hand (`finalized_by`, migration 0027), how long
// ago by the database's own clock (as find-game-ended-ago.ts), whether an overturn not in
// the bin rules on it (as find-game.ts) and whether it is tracked: a saved state and
// plays past the tracker's marker (as find-saved-game-state.ts and game-has-plays.ts).
// The scorekeeper's own reopening reads it so a list does not read once for each game.
// Games of other leagues, or not there, are left out.
import type { HandResultFacts } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listHandResults(
  scope: LeagueScope,
  gameIds: readonly string[],
): Promise<readonly HandResultFacts[]> {
  if (gameIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('games')
    .select(['id', 'status', 'finalized_by'])
    .select(
      sql<
        string | null
      >`(extract(epoch from (statement_timestamp() - finalized_at)) * 1000)::bigint::text`.as(
        'ago',
      ),
    )
    .select((eb) =>
      eb
        .exists(
          eb
            .selectFrom('standings_adjustments as a')
            .select('a.id')
            .whereRef('a.league_id', '=', 'games.league_id')
            .whereRef('a.game_id', '=', 'games.id')
            .where('a.deleted_at', 'is', null),
        )
        .as('overturned'),
    )
    .select((eb) =>
      eb
        .and([
          eb.exists(
            eb
              .selectFrom('game_states as s')
              .select('s.game_id')
              .whereRef('s.league_id', '=', 'games.league_id')
              .whereRef('s.game_id', '=', 'games.id'),
          ),
          sql<boolean>`public.game_tracked_past_marker(games.league_id, games.id)`,
        ])
        .as('tracked'),
    )
    .where('league_id', '=', scope.leagueId)
    .where('id', 'in', [...gameIds])
    // A game in the bin is not offered (as the read for one game refuses it).
    .where('deleted_at', 'is', null)
    .execute();
  return rows.map((row) => ({
    gameId: row.id,
    status: row.status,
    decidedBy: row.finalized_by ?? null,
    ago: row.ago === null ? undefined : Math.max(0, Number(row.ago)),
    overturned: row.overturned === true,
    tracked: row.tracked === true,
  }));
}
