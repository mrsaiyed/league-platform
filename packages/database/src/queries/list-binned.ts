// Everything of the scope's league that is in the bin (`deleted_at` set), newest first
// (A-5): teams, divisions, venues, courts, people and games a publish removed. A game
// that was played is never listed: it is corrected, not restored (S-7). A person who
// was merged into another is not a record of their own.
//
// `kept` says the purge leaves it (purge-binned.ts): a game always (record 025), and
// anything history or a thing outside the bin points at, by the purge's own tests. A
// thing held only by another thing in the bin is not kept: it goes once that one has.
// The two lists of tests change together.
//
// A person's name comes from the one name function (T-81), as an admin sees it: the
// full name as recorded, whatever the public pages show, since the admin is choosing
// whom to bring back. Empty when no name is left (it was erased).
import {
  publicViewer,
  showName,
  type BinDetails,
  type BinKind,
  type BinnedItem,
} from '@srleagues/core';
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
  first_name: string | null;
  last_name: string | null;
  played: number | null;
  to_come: number | null;
  roster_in_bin: string[] | null;
  starts_at: Date | string | null;
  without_round: boolean | null;
  season_name: string | null;
  division_name: string | null;
  venue_name: string | null;
  teams_in_bin: { id: string; name: string }[] | null;
};

/** A person's name on an admin's screen: in full, as recorded (T-81). */
function adminName(leagueId: string, firstName: string, lastName: string): string {
  const shown = showName(
    { firstName, lastName, isMinor: false, nameRequest: 'none' },
    {
      audience: 'adult',
      policy: { names: 'full_name', childrenInFull: true, playersMayAskForInitials: false },
      viewer: { ...publicViewer(leagueId), leagueAdmin: true },
      statsOf: null,
    },
  );
  return shown.shown ? shown.text : '';
}

export async function listBinned(scope: LeagueScope): Promise<readonly BinnedItem[]> {
  const league = scope.leagueId;
  const result = await sql<Row>`
    select 'team' as kind, t.id, t.name, null::text as second_name, t.season_id, t.deleted_at,
      null::text as first_name, null::text as last_name,
      (exists (select 1 from games g where g.league_id = t.league_id
          and t.id in (g.home_team_id, g.away_team_id))
        or exists (select 1 from role_grants r where r.league_id = t.league_id
          and r.scope_team_id = t.id)
        or exists (select 1 from invitations i where i.league_id = t.league_id
          and i.scope_team_id = t.id)
        or exists (select 1 from standings_adjustments s where s.league_id = t.league_id
          and s.team_id = t.id)
        or exists (select 1 from player_game_stats p where p.league_id = t.league_id
          and p.team_id = t.id)) as kept,
      (select count(*) from games g where g.league_id = t.league_id and g.deleted_at is null
          and t.id in (g.home_team_id, g.away_team_id)
          and g.status in ('final', 'forfeit'))::int as played,
      (select count(*) from games g where g.league_id = t.league_id and g.deleted_at is null
          and t.id in (g.home_team_id, g.away_team_id)
          and g.status in ('scheduled', 'postponed', 'live'))::int as to_come,
      array(select r.person_id::text from roster_entries r
          join people p on p.league_id = r.league_id and p.id = r.person_id
          where r.league_id = t.league_id and r.team_id = t.id and r.left_on is null
            and p.deleted_at is not null order by r.sort, r.id) as roster_in_bin,
      null::timestamptz as starts_at, null::boolean as without_round,
      (select s.name from seasons s where s.league_id = t.league_id
          and s.id = t.season_id) as season_name,
      (select d.name from divisions d where d.league_id = t.league_id
          and d.id = t.division_id) as division_name,
      null::text as venue_name, null::jsonb as teams_in_bin
      from teams t where t.league_id = ${league} and t.deleted_at is not null
    union all
    select 'division', d.id, d.name, null, d.season_id, d.deleted_at, null, null,
      exists (select 1 from divisions c where c.league_id = d.league_id
          and c.parent_division_id = d.id and c.deleted_at is null)
        or exists (select 1 from teams t where t.league_id = d.league_id
          and t.division_id = d.id and t.deleted_at is null)
        or exists (select 1 from games g where g.league_id = d.league_id
          and g.division_id = d.id)
        or exists (select 1 from standings_rows s where s.league_id = d.league_id
          and s.division_id = d.id),
      null, null, null, null, null,
      (select s.name from seasons s where s.league_id = d.league_id and s.id = d.season_id),
      null, null, null
      from divisions d where d.league_id = ${league} and d.deleted_at is not null
    union all
    select 'venue', v.id, v.name, null, null, v.deleted_at, null, null,
      exists (select 1 from courts c where c.league_id = v.league_id
          and c.venue_id = v.id and c.deleted_at is null)
        or exists (select 1 from games g where g.league_id = v.league_id and g.venue_id = v.id),
      null, null, null, null, null, null, null, null, null
      from venues v where v.league_id = ${league} and v.deleted_at is not null
    union all
    select 'court', c.id, c.name, null, null, c.deleted_at, null, null,
      exists (select 1 from games g where g.league_id = c.league_id and g.court_id = c.id),
      null, null, null, null, null, null, null,
      (select v.name from venues v where v.league_id = c.league_id and v.id = c.venue_id), null
      from courts c where c.league_id = ${league} and c.deleted_at is not null
    union all
    select 'person', p.id, '', null, null, p.deleted_at, p.first_name, p.last_name,
      exists (select 1 from roster_entries r where r.league_id = p.league_id
          and r.person_id = p.id)
        or exists (select 1 from player_game_stats s where s.league_id = p.league_id
          and s.person_id = p.id)
        or exists (select 1 from season_player_totals s where s.league_id = p.league_id
          and s.person_id = p.id)
        or exists (select 1 from people m where m.league_id = p.league_id
          and m.merged_into_id = p.id),
      null, null, null, null, null, null, null, null, null
      from people p where p.league_id = ${league} and p.deleted_at is not null
        and p.merged_into_id is null
    union all
    select 'game', g.id, h.name, a.name, g.season_id, g.deleted_at, null, null, true,
      null, null, null, g.starts_at, g.round_id is null,
      (select s.name from seasons s where s.league_id = g.league_id and s.id = g.season_id),
      null, null,
      (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)
          order by x.name, x.id), '[]'::jsonb)
        from teams x where x.league_id = g.league_id and x.deleted_at is not null
          and x.id in (g.home_team_id, g.away_team_id))
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
    name:
      row.kind === 'person'
        ? adminName(league, row.first_name ?? '', row.last_name ?? '')
        : row.name,
    secondName: row.second_name,
    seasonId: row.season_id,
    binnedAt: new Date(row.deleted_at).toISOString(),
    kept: row.kept,
    ...detailsOf(row),
  }));
}

/**
 * What the bin screen tells about a thing before it comes back (step 2.77): a team's
 * games, roster, season and division; a game's start, round, season and teams in the bin;
 * a division's season; a court's venue, so two of one name can be told apart.
 */
function detailsOf(row: Row): { details?: BinDetails } {
  const season = row.season_name === null ? {} : { seasonName: row.season_name };
  if (row.kind === 'team') {
    return {
      details: {
        gamesPlayed: row.played ?? 0,
        gamesToCome: row.to_come ?? 0,
        rosterInBin: row.roster_in_bin ?? [],
        ...season,
        divisionName: row.division_name,
      },
    };
  }
  if (row.kind === 'game') {
    return {
      details: {
        startsAt: row.starts_at === null ? null : new Date(row.starts_at).toISOString(),
        withoutRound: row.without_round === true,
        ...season,
        teamsInBin: row.teams_in_bin ?? [],
      },
    };
  }
  if (row.kind === 'division') return { details: season };
  if (row.kind === 'court' && row.venue_name !== null) {
    return { details: { venueName: row.venue_name } };
  }
  return {};
}
