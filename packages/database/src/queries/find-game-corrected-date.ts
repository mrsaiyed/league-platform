// The date (YYYY-MM-DD, in the league's time zone) of a game's latest correction, or undefined if it was
// never corrected. Only the date: the reason stays private (S-7).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameCorrectedDate(
  scope: LeagueScope,
  gameId: string,
): Promise<string | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('game_corrections')
    .innerJoin('leagues', 'leagues.id', 'game_corrections.league_id')
    .select(
      sql<string>`to_char(game_corrections.created_at at time zone leagues.time_zone, 'YYYY-MM-DD')`.as(
        'local_date',
      ),
    )
    .where('game_corrections.league_id', '=', scope.leagueId)
    .where('game_corrections.game_id', '=', gameId)
    .orderBy('game_corrections.created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row === undefined ? undefined : row.local_date;
}
