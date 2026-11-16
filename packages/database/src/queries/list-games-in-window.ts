// The scope's games from the start of the league's today for a number of days (P4 §4:
// the scorekeeper's games for today and the week), and every live game whenever it
// started, so a game under way since before the league's midnight is still listed after
// it (step 2.156); not in the bin and of a season not in the bin, soonest first. "Today"
// is worked out by the database, from its own clock and the league's time zone, so it is
// the league's today wherever the server runs. Each game comes with its season's program
// (where scoring it is checked) and whether the account is assigned to it. Every table
// read is filtered to the scope's league (T-28).
import type { GamesWindow } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameInList, gamesForLists } from './games-for-lists.ts';

export async function listGamesInWindow(
  scope: LeagueScope,
  accountId: string,
  days: number,
): Promise<GamesWindow> {
  const league = await transactionOf(scope)
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
  const rows = await gamesForLists(scope, accountId, league)
    .where((eb) =>
      eb.or([
        eb.and([eb('g.starts_at', '>=', league.from_at), eb('g.starts_at', '<', league.until_at)]),
        eb('g.status', '=', 'live'),
      ]),
    )
    // Ascending puts a live game with no time last (PostgreSQL's own order).
    .orderBy('g.starts_at')
    .orderBy('g.id')
    .execute();
  return { today: league.today, games: rows.map(gameInList) };
}
