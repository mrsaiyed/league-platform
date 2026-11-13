// Creates the games a publication adds, in the scope's league (P7 §4.4). The season's
// regular stage is made if it has none yet. A game's division is its teams' when both are
// in the same one, else empty (a game across divisions); its time is read in the league's
// own time zone and its court found by name at its venue. Everything the database checks
// (teams of the season, court at the venue) still holds, so a wrong id raises.
import type { NewPublishedGame } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertPublishedGames(
  scope: LeagueScope,
  seasonId: string,
  games: readonly NewPublishedGame[],
): Promise<void> {
  if (games.length === 0) return;
  const trx = transactionOf(scope);
  const league = await trx
    .selectFrom('leagues')
    .select('time_zone')
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  const zone = league?.time_zone ?? 'UTC';
  await sql`
    insert into stages (league_id, season_id, name)
    select ${scope.leagueId}, s.id, 'Regular season'
    from seasons s
    where s.league_id = ${scope.leagueId} and s.id = ${seasonId}
    on conflict (league_id, season_id) where type = 'regular' do nothing`.execute(trx);
  const stage = await trx
    .selectFrom('stages')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('type', '=', 'regular')
    .executeTakeFirstOrThrow();
  const rows = games.map((g) => ({
    id: g.id,
    round_id: g.roundId,
    home_team_id: g.homeTeamId,
    away_team_id: g.awayTeamId,
    day: g.date,
    clock: g.time,
    venue_id: g.venueId,
    court: g.court,
    capture_mode: g.captureMode,
  }));
  await sql`
    insert into games (id, league_id, season_id, stage_id, division_id, round_id,
      home_team_id, away_team_id, starts_at, venue_id, court_id, status, capture_mode)
    select g.id, ${scope.leagueId}, ${seasonId}, ${stage.id},
      (select case when h.division_id = a.division_id then h.division_id end
         from teams h, teams a
        where h.league_id = ${scope.leagueId} and h.id = g.home_team_id
          and a.league_id = ${scope.leagueId} and a.id = g.away_team_id),
      g.round_id, g.home_team_id, g.away_team_id,
      (g.day::date + g.clock::time) at time zone ${zone},
      g.venue_id,
      (select c.id from courts c
        where c.league_id = ${scope.leagueId} and c.venue_id = g.venue_id
          and c.name = g.court and c.deleted_at is null),
      'scheduled', g.capture_mode
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      as g(id uuid, round_id uuid, home_team_id uuid, away_team_id uuid, day text,
           clock text, venue_id uuid, court text, capture_mode text)`.execute(trx);
}
