// Each team's total of each stat over the final games of a season, summed over its
// players' lines that entered the game (P7 §6, §8): the numbers shown where a team's
// player lines are hidden (S-22). `gamesRecorded` counts the games with the stat. A value
// that is not a whole number is skipped, never allowed to fail the page (the database
// already refuses one, is_stat_counts).
//
// A team's points are its final scores instead (S-26 as changed by step 2.196, decided for
// you): over the same games, those where its players' points were recorded, the score the
// game's page and the standings show, which a typed box score can make different from what
// its players' points add to. A player's own points stay their lines'. `linesTotal` is what
// the players' lines add to, so the statistics page can say when a team's total differs.
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
    lines_total: string;
    games_recorded: string;
  }>`
    select c.team_id, c.stat_key,
           sum(case when c.stat_key = 'points' and c.score is not null then c.score
                    else c.total end)::text as total,
           sum(c.total)::text as lines_total,
           count(*)::text as games_recorded
      from (
        select s.team_id, e.key as stat_key, s.game_id,
               sum((e.value #>> '{}')::bigint) as total,
               max(case when s.team_id = g.home_team_id then g.home_score
                        when s.team_id = g.away_team_id then g.away_score end) as score
          from player_game_stats s
          join games g on g.league_id = s.league_id and g.id = s.game_id
          cross join lateral jsonb_each(s.stats) e
         where s.league_id = ${scope.leagueId} and g.season_id = ${seasonId}
           and g.status = 'final' and g.deleted_at is null and s.played
           and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[0-9]{1,15}$'
         group by s.team_id, e.key, s.game_id
      ) c
     group by c.team_id, c.stat_key
     order by c.team_id, c.stat_key`.execute(transactionOf(scope));
  return result.rows.map((row) => ({
    teamId: row.team_id,
    statKey: row.stat_key,
    total: Number(row.total),
    linesTotal: Number(row.lines_total),
    gamesRecorded: Number(row.games_recorded),
  }));
}
