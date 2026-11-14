// Removes for good what the scope's league put in the bin at or before `cutoff` (T-51),
// children first: courts, venues, teams (with their roster entries and standings rows),
// divisions (a parent only once its sub-divisions are gone), then people. Anything
// something else still points at stays, so history is never broken: a team with games,
// a grant or an adjustment, a person with a roster history or statistics, a venue or
// division a game names. Games are not removed here: the app has no DELETE on games
// (0009), so a binned game stays until the league itself is purged (record 025).
// Every statement names the league, so it cannot reach another's rows (T-28).
// list-binned.ts says beforehand what this leaves (`kept`): change its tests with these.
import type { BinCounts } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function purgeBinned(scope: LeagueScope, cutoff: Date): Promise<BinCounts> {
  const trx = transactionOf(scope);
  const league = scope.leagueId;
  const at = cutoff.toISOString();
  const count = (rows: readonly unknown[]) => rows.length;

  const courts = await sql`
    delete from courts c
    where c.league_id = ${league} and c.deleted_at <= ${at}::timestamptz
      and not exists (select 1 from games g where g.league_id = c.league_id and g.court_id = c.id)
    returning c.id
  `.execute(trx);

  const venues = await sql`
    delete from venues v
    where v.league_id = ${league} and v.deleted_at <= ${at}::timestamptz
      and not exists (select 1 from courts c where c.league_id = v.league_id and c.venue_id = v.id)
      and not exists (select 1 from games g where g.league_id = v.league_id and g.venue_id = v.id)
    returning v.id
  `.execute(trx);

  const eligibleTeams = await sql<{ id: string }>`
    select t.id from teams t
    where t.league_id = ${league} and t.deleted_at <= ${at}::timestamptz
      and not exists (select 1 from games g where g.league_id = t.league_id
        and t.id in (g.home_team_id, g.away_team_id))
      and not exists (select 1 from role_grants r where r.league_id = t.league_id
        and r.scope_team_id = t.id)
      and not exists (select 1 from invitations i where i.league_id = t.league_id
        and i.scope_team_id = t.id)
      and not exists (select 1 from standings_adjustments s where s.league_id = t.league_id
        and s.team_id = t.id)
      and not exists (select 1 from player_game_stats p where p.league_id = t.league_id
        and p.team_id = t.id)
  `.execute(trx);
  const teamIds = eligibleTeams.rows.map((row) => row.id);
  let teams = 0;
  if (teamIds.length > 0) {
    // What the teams own or have worked out goes with them.
    await sql`delete from standings_rows where league_id = ${league}
      and team_id = any(${teamIds}::uuid[])`.execute(trx);
    await sql`delete from roster_entries where league_id = ${league}
      and team_id = any(${teamIds}::uuid[])`.execute(trx);
    teams = count(
      (
        await sql`delete from teams where league_id = ${league}
          and id = any(${teamIds}::uuid[]) returning id`.execute(trx)
      ).rows,
    );
  }

  // A parent waits for its sub-divisions, so repeat until a pass removes none.
  let divisions = 0;
  for (let pass = 0; pass < 20; pass++) {
    const removed = await sql`
      delete from divisions d
      where d.league_id = ${league} and d.deleted_at <= ${at}::timestamptz
        and not exists (select 1 from divisions c where c.league_id = d.league_id
          and c.parent_division_id = d.id)
        and not exists (select 1 from teams t where t.league_id = d.league_id
          and t.division_id = d.id)
        and not exists (select 1 from games g where g.league_id = d.league_id
          and g.division_id = d.id)
        and not exists (select 1 from standings_rows s where s.league_id = d.league_id
          and s.division_id = d.id)
      returning d.id
    `.execute(trx);
    if (removed.rows.length === 0) break;
    divisions += removed.rows.length;
  }

  const people = await sql`
    delete from people p
    where p.league_id = ${league} and p.deleted_at <= ${at}::timestamptz
      and not exists (select 1 from roster_entries r where r.league_id = p.league_id
        and r.person_id = p.id)
      and not exists (select 1 from player_game_stats s where s.league_id = p.league_id
        and s.person_id = p.id)
      and not exists (select 1 from season_player_totals s where s.league_id = p.league_id
        and s.person_id = p.id)
      and not exists (select 1 from people m where m.league_id = p.league_id
        and m.merged_into_id = p.id)
    returning p.id
  `.execute(trx);

  return {
    courts: count(courts.rows),
    venues: count(venues.rows),
    teams,
    divisions,
    people: count(people.rows),
  };
}
