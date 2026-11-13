// A season's published schedule as the scheduling rules read it (P7 §4.3): its rounds and
// its games not in the bin that have a date. Dates and times are the league's own (its
// time zone), a game's court is its name, and a round with no label is "Round n".
import type { GameRecording, ScheduleGame, ScheduleState } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

const recordingOf = (captureMode: string): GameRecording | null =>
  captureMode === 'final'
    ? 'final-score'
    : captureMode === 'box'
      ? 'box-score'
      : captureMode === 'live'
        ? 'live'
        : null;

export async function loadSchedule(scope: LeagueScope, seasonId: string): Promise<ScheduleState> {
  const trx = transactionOf(scope);
  const league = await trx
    .selectFrom('leagues')
    .select('time_zone')
    .where('id', '=', scope.leagueId)
    .executeTakeFirst();
  const zone = league?.time_zone ?? 'UTC';
  const rounds = await trx
    .selectFrom('rounds')
    .select(['id', 'number', 'label', sql<string | null>`to_char(date, 'YYYY-MM-DD')`.as('day')])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .orderBy('number')
    .execute();
  const games = await trx
    .selectFrom('games as g')
    .leftJoin('courts as c', (join) =>
      join.onRef('c.id', '=', 'g.court_id').onRef('c.league_id', '=', 'g.league_id'),
    )
    .select([
      'g.id',
      'g.round_id',
      'g.venue_id',
      'g.home_team_id',
      'g.away_team_id',
      'g.status',
      'g.capture_mode',
      'c.name as court_name',
      sql<string>`to_char(g.starts_at at time zone ${zone}, 'YYYY-MM-DD')`.as('day'),
      sql<string>`to_char(g.starts_at at time zone ${zone}, 'HH24:MI')`.as('clock'),
    ])
    .where('g.league_id', '=', scope.leagueId)
    .where('g.season_id', '=', seasonId)
    .where('g.deleted_at', 'is', null)
    .where('g.starts_at', 'is not', null)
    .orderBy('g.starts_at')
    .orderBy('g.id')
    .execute();
  return {
    rounds: rounds.map((r) => ({ id: r.id, label: r.label ?? `Round ${r.number}`, date: r.day })),
    games: games.map((g) => ({
      id: g.id,
      roundId: g.round_id,
      date: g.day,
      time: g.clock,
      venueId: g.venue_id,
      court: g.court_name,
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
      status: g.status as ScheduleGame['status'],
      recording: recordingOf(g.capture_mode),
    })),
  };
}
