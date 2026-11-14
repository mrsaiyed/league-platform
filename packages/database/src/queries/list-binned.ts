// Everything of the scope's league that is in the bin (`deleted_at` set), newest first
// (A-5): teams, divisions, venues, courts, people and games a publish removed. A game
// that was played is never listed: it is corrected, not restored (S-7). A person who
// was merged into another is not a record of their own.
//
// `kept` says the purge leaves it (purge-binned.ts): a game always (record 025), and
// anything history or a thing outside the bin points at, by the purge's own tests. A
// thing held only by another thing in the bin is not kept: it goes once that one has.
// The two lists of tests change together.
import type { BinKind, BinnedItem } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

type Row = {
  kind: BinKind;
  id: string;
  name: string;
  second_name: string | null;
  season_id: string | null;
  deleted_at: Date | string;
  kept: boolean;
};

export async function listBinned(scope: LeagueScope): Promise<readonly BinnedItem[]> {
  const league = scope.leagueId;
  const result = await sql<Row>`
    select 'team' as kind, t.id, t.name, null::text as second_name, t.season_id, t.deleted_at,
      (exists (select 1 from games g where g.league_id = t.league_id
          and t.id in (g.home_team_id, g.away_team_id))
        or exists (select 1 from role_grants r where r.league_id = t.league_id
          and r.scope_team_id = t.id)
        or exists (select 1 from invitations i where i.league_id = t.league_id
          and i.scope_team_id = t.id)
        or exists (select 1 from standings_adjustments s where s.league_id = t.league_id
          and s.team_id = t.id)
        or exists (select 1 from player_game_stats p where p.league_id = t.league_id
          and p.team_id = t.id)) as kept
      from teams t where t.league_id = ${league} and t.deleted_at is not null
    union all
    select 'division', d.id, d.name, null, d.season_id, d.deleted_at,
      exists (select 1 from divisions c where c.league_id = d.league_id
          and c.parent_division_id = d.id and c.deleted_at is null)
        or exists (select 1 from teams t where t.league_id = d.league_id
          and t.division_id = d.id and t.deleted_at is null)
        or exists (select 1 from games g where g.league_id = d.league_id
          and g.division_id = d.id)
        or exists (select 1 from standings_rows s where s.league_id = d.league_id
          and s.division_id = d.id)
      from divisions d where d.league_id = ${league} and d.deleted_at is not null
    union all
    select 'venue', v.id, v.name, null, null, v.deleted_at,
      exists (select 1 from courts c where c.league_id = v.league_id
          and c.venue_id = v.id and c.deleted_at is null)
        or exists (select 1 from games g where g.league_id = v.league_id and g.venue_id = v.id)
      from venues v where v.league_id = ${league} and v.deleted_at is not null
    union all
    select 'court', c.id, c.name, null, null, c.deleted_at,
      exists (select 1 from games g where g.league_id = c.league_id and g.court_id = c.id)
      from courts c where c.league_id = ${league} and c.deleted_at is not null
    union all
    select 'person', p.id, btrim(p.first_name || ' ' || p.last_name), null, null, p.deleted_at,
      exists (select 1 from roster_entries r where r.league_id = p.league_id
          and r.person_id = p.id)
        or exists (select 1 from player_game_stats s where s.league_id = p.league_id
          and s.person_id = p.id)
        or exists (select 1 from season_player_totals s where s.league_id = p.league_id
          and s.person_id = p.id)
        or exists (select 1 from people m where m.league_id = p.league_id
          and m.merged_into_id = p.id)
      from people p where p.league_id = ${league} and p.deleted_at is not null
        and p.merged_into_id is null
    union all
    select 'game', g.id, h.name, a.name, g.season_id, g.deleted_at, true
      from games g
      join teams h on h.league_id = g.league_id and h.id = g.home_team_id
      join teams a on a.league_id = g.league_id and a.id = g.away_team_id
      where g.league_id = ${league} and g.deleted_at is not null
        and g.status in ('scheduled', 'postponed', 'cancelled')
    order by deleted_at desc, id
  `.execute(transactionOf(scope));
  return result.rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    name: row.name,
    secondName: row.second_name,
    seasonId: row.season_id,
    binnedAt: new Date(row.deleted_at).toISOString(),
    kept: row.kept,
  }));
}
