// The scope's games from the start of the league's today for a number of days (P4 §4:
// the scorekeeper's games for today and the week), not in the bin and of a season
// not in the bin, soonest first. "Today" is worked out by the database, from its own
// clock and the league's time zone, so it is the league's today wherever the server
// runs. Each game comes with its season's program (where scoring it is checked) and
// whether the account is assigned to it. Every table read is filtered to the
// scope's league (T-28).
import type { GamesWindow } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameSummary } from './game-summary.ts';

export async function listGamesInWindow(
  scope: LeagueScope,
  accountId: string,
  days: number,
): Promise<GamesWindow> {
  const trx = transactionOf(scope);
  const league = await trx
    .selectFrom('leagues')
    .select([
      'time_zone',
      sql<string>`to_char(now() at time zone time_zone, 'YYYY-MM-DD')`.as('today'),
      sql<Date>`date_trunc('day', now() at time zone time_zone) at time zone time_zone`.as(
        'from_at',
      ),
      // Days added in the league's own calendar, so a clock change in the week moves nothing.
      sql<Date>`(date_trunc('day', now() at time zone time_zone) + ${days}::integer * interval '1 day')
        at time zone time_zone`.as('until_at'),
    ])
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  if (league === undefined) return { today: '', games: [] };
  const rows = await trx
    .selectFrom('games as g')
    .innerJoin('seasons as s', (join) =>
      join.onRef('s.league_id', '=', 'g.league_id').onRef('s.id', '=', 'g.season_id'),
    )
    .select((eb) => [
      'g.id',
      'g.season_id',
      'g.division_id',
      'g.home_team_id',
      'g.away_team_id',
      'g.starts_at',
      'g.status',
      'g.capture_mode',
      'g.home_score',
      'g.away_score',
      'g.format',
      'g.finalized_at',
      'g.deleted_at',
      'g.version',
      's.program_id',
      sql<string>`to_char(g.starts_at at time zone ${league.time_zone}, 'YYYY-MM-DD')`.as('day'),
      eb
        .exists(
          eb
            .selectFrom('game_assignments as a')
            .select('a.id')
            .where('a.league_id', '=', scope.leagueId)
            .whereRef('a.game_id', '=', 'g.id')
            .where('a.account_id', '=', accountId),
        )
        .as('assigned'),
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('s.league_id', '=', scope.leagueId)
    .where('g.deleted_at', 'is', null)
    .where('s.deleted_at', 'is', null)
    .where('g.starts_at', '>=', league.from_at)
    .where('g.starts_at', '<', league.until_at)
    .orderBy('g.starts_at')
    .orderBy('g.id')
    .execute();
  return {
    today: league.today,
    games: rows.map((row) => ({
      game: gameSummary(row),
      programId: row.program_id,
      day: row.day,
      assigned: row.assigned === true,
    })),
  };
}
