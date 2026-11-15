// The rounds of the scope's earlier games (step 2.156, core's earlier-rounds-of.ts): the
// games in no bin, of a season in no bin, that started before the league's today and are
// final, forfeited, postponed or cancelled, counted by round (a season's games in no round
// counted together), with how many the account is assigned to; only the games in the
// person's reach are counted, before the cut, so a round of theirs is never pushed out by
// rounds they do not score; latest played first, at most `limit`. Only the counts are
// read, so a league with hundreds of past games opens quickly; one round's games are read
// by list-earlier-round.ts. Every table read is filtered to the scope's league (T-28).
import type { EarlierRoundCount, ScoringReach } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { inReachOf, leagueDayOf } from './games-for-lists.ts';

/** The statuses of a game that waits for no result (core's isOverOrCalledOff). */
export const overOrCalledOff = ['final', 'forfeit', 'postponed', 'cancelled'];

export async function listEarlierRounds(
  scope: LeagueScope,
  accountId: string,
  reach: ScoringReach,
  limit: number,
): Promise<readonly EarlierRoundCount[]> {
  const league = await leagueDayOf(scope);
  if (league === undefined) return [];
  const day = sql<string>`to_char(g.starts_at at time zone ${league.time_zone}, 'YYYY-MM-DD')`;
  const rows = await transactionOf(scope)
    .selectFrom('games as g')
    .innerJoin('seasons as s', (join) =>
      join.onRef('s.league_id', '=', 'g.league_id').onRef('s.id', '=', 'g.season_id'),
    )
    .leftJoin('rounds as r', (join) =>
      join.onRef('r.league_id', '=', 'g.league_id').onRef('r.id', '=', 'g.round_id'),
    )
    .select([
      'g.season_id',
      's.program_id',
      'g.round_id',
      'r.number',
      'r.label',
      sql<string>`min(${day})`.as('first_day'),
      sql<string>`max(${day})`.as('last_day'),
      sql<number>`count(*)::integer`.as('games'),
      sql<number>`(count(*) filter (where exists (
        select 1 from game_assignments a
        where a.league_id = ${scope.leagueId} and a.game_id = g.id and a.account_id = ${accountId}
      )))::integer`.as('assigned'),
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('s.league_id', '=', scope.leagueId)
    .where('g.deleted_at', 'is', null)
    .where('s.deleted_at', 'is', null)
    .where('g.starts_at', '<', league.from_at)
    .where('g.status', 'in', overOrCalledOff)
    .where(inReachOf(scope, accountId, reach))
    .groupBy(['g.season_id', 's.program_id', 'g.round_id', 'r.number', 'r.label'])
    .orderBy(sql`max(${day})`, 'desc')
    .orderBy('g.season_id')
    .orderBy('r.number')
    .orderBy('g.round_id')
    .limit(limit)
    .execute();
  return rows.map((row) => ({
    seasonId: row.season_id,
    programId: row.program_id,
    roundId: row.round_id,
    number: row.number,
    label: row.label,
    firstDay: row.first_day,
    lastDay: row.last_day,
    games: row.games,
    assigned: row.assigned,
  }));
}
