// Everything of the scope's league that is in the bin (`deleted_at` set), newest first
// (A-5): teams, divisions, venues, courts, people and games a publish removed. A game
// that was played is never listed: it is corrected, not restored (S-7). A person who
// was merged into another is not a record of their own.
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
};

export async function listBinned(scope: LeagueScope): Promise<readonly BinnedItem[]> {
  const league = scope.leagueId;
  const result = await sql<Row>`
    select 'team' as kind, id, name, null::text as second_name, season_id, deleted_at
      from teams where league_id = ${league} and deleted_at is not null
    union all
    select 'division', id, name, null, season_id, deleted_at
      from divisions where league_id = ${league} and deleted_at is not null
    union all
    select 'venue', id, name, null, null, deleted_at
      from venues where league_id = ${league} and deleted_at is not null
    union all
    select 'court', id, name, null, null, deleted_at
      from courts where league_id = ${league} and deleted_at is not null
    union all
    select 'person', id, btrim(first_name || ' ' || last_name), null, null, deleted_at
      from people where league_id = ${league} and deleted_at is not null
        and merged_into_id is null
    union all
    select 'game', g.id, h.name, a.name, g.season_id, g.deleted_at
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
  }));
}
