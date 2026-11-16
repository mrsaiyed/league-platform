// What the admin's lists of games read (list-games-in-window.ts, and step 2.156's
// list-games-needing-result.ts and list-earlier-round.ts): the scope's games joined to
// their season, in no bin and of a season in no bin, each with its season's program, the
// day it is played in the league's time zone and whether the account is assigned to it.
// Every table read is filtered to the scope's league (T-28).
import type { GameInWindow, ScoringReach } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameSummary } from './game-summary.ts';

/** The scope's league: its time zone, its today (YYYY-MM-DD) and the moment that today began. */
export async function leagueDayOf(scope: LeagueScope) {
  return transactionOf(scope)
    .selectFrom('leagues')
    .select([
      'id',
      'time_zone',
      sql<string>`to_char(now() at time zone time_zone, 'YYYY-MM-DD')`.as('today'),
      sql<Date>`date_trunc('day', now() at time zone time_zone) at time zone time_zone`.as(
        'from_at',
      ),
    ])
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
}

/**
 * The scope's games as the lists read them, for the query to narrow and order. `today` is
 * the day given to a game with no time (only a live one is ever listed so).
 */
export function gamesForLists(
  scope: LeagueScope,
  accountId: string,
  league: { readonly time_zone: string; readonly today: string },
) {
  return transactionOf(scope)
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
      sql<string>`coalesce(to_char(g.starts_at at time zone ${league.time_zone}, 'YYYY-MM-DD'), ${league.today})`.as(
        'day',
      ),
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
    .where('s.deleted_at', 'is', null);
}

/**
 * The condition that keeps the games in `reach` (core's ScoringReach), for a query over
 * `games as g` joined to `seasons as s`: every game of the programs in `reach.every`, and
 * the account's assigned games of the programs in `reach.assigned`. A list applies it
 * before it cuts, so no game the person scores is pushed out by games they do not. The
 * assignments read are filtered to the scope's league (T-28).
 */
export function inReachOf(scope: LeagueScope, accountId: string, reach: ScoringReach) {
  if (reach.every === 'all') return sql<boolean>`true`;
  const assigned = sql`exists (
    select 1 from game_assignments a
    where a.league_id = ${scope.leagueId} and a.game_id = g.id and a.account_id = ${accountId}
  )`;
  const parts = [];
  if (reach.every.length > 0) parts.push(sql`s.program_id in (${sql.join(reach.every)})`);
  if (reach.assigned === 'all') parts.push(assigned);
  else if (reach.assigned.length > 0) {
    parts.push(sql`(s.program_id in (${sql.join(reach.assigned)}) and ${assigned})`);
  }
  return parts.length === 0 ? sql<boolean>`false` : sql<boolean>`(${sql.join(parts, sql` or `)})`;
}

type ListRow = Parameters<typeof gameSummary>[0] & {
  readonly program_id: string;
  readonly day: string;
  readonly assigned: unknown;
};

/** A row the lists read, as core's games commands take it. */
export const gameInList = (row: ListRow): GameInWindow => ({
  game: gameSummary(row),
  programId: row.program_id,
  day: row.day,
  assigned: row.assigned === true,
});
