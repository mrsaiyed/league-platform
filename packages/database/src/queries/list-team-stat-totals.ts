// Each team's total of each stat over the final games of a season, summed over its
// players' lines that entered the game (P7 §6, §8): the numbers shown where a team's
// player lines are hidden (S-22). `gamesRecorded` counts the games with the stat.
import { sql } from 'kysely';
import type { TeamStatTotalRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listTeamStatTotals(
  scope: LeagueScope,
  seasonId: string,
): Promise<TeamStatTotalRecord[]> {
  const result = await sql<{
    team_id: string;
    stat_key: string;
    total: string;
    games_recorded: string;
  }>`
    select s.team_id, e.key as stat_key,
           sum(e.value::bigint)::text as total,
           count(distinct s.game_id)::text as games_recorded
      from player_game_stats s
      join games g on g.league_id = s.league_id and g.id = s.game_id
      cross join lateral jsonb_each_text(s.stats) e
     where s.league_id = ${scope.leagueId} and g.season_id = ${seasonId}
       and g.status = 'final' and g.deleted_at is null and s.played
     group by s.team_id, e.key
     order by s.team_id, e.key`.execute(transactionOf(scope));
  return result.rows.map((row) => ({
    teamId: row.team_id,
    statKey: row.stat_key,
    total: Number(row.total),
    gamesRecorded: Number(row.games_recorded),
  }));
}
