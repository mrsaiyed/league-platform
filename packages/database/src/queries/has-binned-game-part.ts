// Whether a game of the scope's league names a team, division, venue or court that is
// in the bin, so it cannot come back before that does. False if the game is not there.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function hasBinnedGamePart(scope: LeagueScope, gameId: string): Promise<boolean> {
  const result = await sql<{ binned: boolean }>`
    select (
      exists (select 1 from teams t where t.league_id = g.league_id and t.deleted_at is not null
                and t.id in (g.home_team_id, g.away_team_id))
      or exists (select 1 from divisions d where d.league_id = g.league_id
                and d.id = g.division_id and d.deleted_at is not null)
      or exists (select 1 from venues v where v.league_id = g.league_id
                and v.id = g.venue_id and v.deleted_at is not null)
      or exists (select 1 from courts c where c.league_id = g.league_id
                and c.id = g.court_id and c.deleted_at is not null)
    ) as binned
    from games g where g.league_id = ${scope.leagueId} and g.id = ${gameId}
  `.execute(transactionOf(scope));
  return result.rows[0]?.binned === true;
}
