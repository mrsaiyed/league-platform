-- 0025: coin flips the admin records, and the team that has left (step 2.56, last part;
-- P7 §1 and §6, S-87, S-89, T-314; T3 §9; record 030 left the coin flips' place open).
--
-- Teams level after every tiebreaker share a place and are listed by id (0022's note
-- says so) until the admin records the order a coin flip gave them. A coin flip is one
-- row: the season, the level teams in the order the flip put them (winner first), how
-- it was made (`by-hand`: flipped at the table and typed in; `drawn`: "Flip for us",
-- drawn by the server), who recorded it, when, and an optional note. The standings
-- rebuild passes the season's flips not in the bin to the calculation, which uses the
-- latest one that covers every team of a level set (packages/sports, order-teams.ts).
-- Changing the order records a new flip and sends the old one to the bin; taking it off
-- sends it to the bin (T-45). The app has no DELETE.
--
-- The teams are a list, not rows of their own (T-314): the trigger below checks every
-- id names a team of the same league and season, and none twice, when the row is made;
-- the list never changes afterwards (the update trigger fixes it).
--
-- The team that has left (S-87): `teams.left_at`, empty while the team plays. Its played
-- results stay; standings and Teams mark it "Left the league" and new games are not
-- offered for it. The bin and its restore leave the column as it is.
--
-- Nothing is moved or dropped; league_rows (0020) is made again with the new table in
-- its list (T-183).

create table public.standings_coin_flips (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  team_ids uuid[] not null,
  method text not null,
  note text,
  account_id uuid not null references public.accounts (id),
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standings_coin_flips_league_id_key unique (league_id, id),
  constraint standings_coin_flips_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint standings_coin_flips_team_count check (
    cardinality(team_ids) between 2 and 200 and array_position(team_ids, null) is null
  ),
  constraint standings_coin_flips_method check (method in ('by-hand', 'drawn')),
  constraint standings_coin_flips_note_length check (
    note is null or length(btrim(note)) between 1 and 500
  ),
  constraint standings_coin_flips_version_positive check (version > 0)
);

create index standings_coin_flips_season_lookup
  on public.standings_coin_flips (league_id, season_id) where deleted_at is null;
create index standings_coin_flips_account_lookup on public.standings_coin_flips (account_id);

comment on table public.standings_coin_flips is
  'A coin flip the admin recorded for teams level after every tiebreaker (T3 §9, S-89, T-314): the teams in the order it put them, winner first. The standings use the latest one not in the bin that covers a level set.';

-- Every team of the flip is a team of the same league and season, once (T-314).
create or replace function public.standings_coin_flip_teams() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if (select count(distinct t) from unnest(new.team_ids) as t) <> cardinality(new.team_ids) then
    raise exception 'A coin flip names each team once'
      using errcode = 'check_violation', constraint = 'standings_coin_flips_teams';
  end if;
  if (
    select count(*) from public.teams
    where league_id = new.league_id and season_id = new.season_id and id = any (new.team_ids)
  ) <> cardinality(new.team_ids) then
    raise exception 'A coin flip names only teams of its season'
      using errcode = 'foreign_key_violation', constraint = 'standings_coin_flips_teams';
  end if;
  return new;
end
$$;

comment on function public.standings_coin_flip_teams() is
  'BEFORE INSERT on standings_coin_flips: every team named is a team of the row''s league and season, and none is named twice (T-314).';

create trigger standings_coin_flips_teams before insert on public.standings_coin_flips
  for each row execute function public.standings_coin_flip_teams();

create trigger standings_coin_flips_on_update before update on public.standings_coin_flips
  for each row execute function public.on_row_update(
    'season_id', 'team_ids', 'method', 'note', 'account_id'
  );

grant select, insert, update on public.standings_coin_flips to app_user;

alter table public.standings_coin_flips enable row level security;
alter table public.standings_coin_flips force row level security;

create policy standings_coin_flips_league_fence on public.standings_coin_flips
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

-- The team that has left (S-87) --------------------------------------------------------------

alter table public.teams add column left_at timestamptz;

comment on column public.teams.left_at is
  'When the admin marked the team as having left the league mid-season (S-87): empty while it plays. Its played results stay; it is offered for no new game.';

-- 0020's league_rows, with standings_coin_flips in its list -----------------------------------

create or replace function public.league_rows(wanted uuid)
returns table (table_name text, row_count bigint)
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.require_view_of_every_league();
  return query
            select 'public.activity_log', count(*) from public.activity_log where league_id = wanted
  union all select 'public.command_receipts', count(*) from public.command_receipts where league_id = wanted
  union all select 'public.courts', count(*) from public.courts where league_id = wanted
  union all select 'public.divisions', count(*) from public.divisions where league_id = wanted
  union all select 'public.game_assignments', count(*) from public.game_assignments where league_id = wanted
  union all select 'public.game_corrections', count(*) from public.game_corrections where league_id = wanted
  union all select 'public.game_events', count(*) from public.game_events where league_id = wanted
  union all select 'public.game_states', count(*) from public.game_states where league_id = wanted
  union all select 'public.games', count(*) from public.games where league_id = wanted
  union all select 'public.imports', count(*) from public.imports where league_id = wanted
  union all select 'public.invitations', count(*) from public.invitations where league_id = wanted
  union all select 'public.jobs', count(*) from public.jobs where league_id = wanted
  union all select 'public.league_features', count(*) from public.league_features where league_id = wanted
  union all select 'public.league_slug_history', count(*) from public.league_slug_history where league_id = wanted
  union all select 'public.people', count(*) from public.people where league_id = wanted
  union all select 'public.player_game_stats', count(*) from public.player_game_stats where league_id = wanted
  union all select 'public.programs', count(*) from public.programs where league_id = wanted
  union all select 'public.role_grants', count(*) from public.role_grants where league_id = wanted
  union all select 'public.roster_entries', count(*) from public.roster_entries where league_id = wanted
  union all select 'public.rounds', count(*) from public.rounds where league_id = wanted
  union all select 'public.schedule_drafts', count(*) from public.schedule_drafts where league_id = wanted
  union all select 'public.schedule_revisions', count(*) from public.schedule_revisions where league_id = wanted
  union all select 'public.scoring_sessions', count(*) from public.scoring_sessions where league_id = wanted
  union all select 'public.season_player_totals', count(*) from public.season_player_totals where league_id = wanted
  union all select 'public.seasons', count(*) from public.seasons where league_id = wanted
  union all select 'public.setting_values', count(*) from public.setting_values where league_id = wanted
  union all select 'public.site_releases', count(*) from public.site_releases where league_id = wanted
  union all select 'public.sites', count(*) from public.sites where league_id = wanted
  union all select 'public.stages', count(*) from public.stages where league_id = wanted
  union all select 'public.standings_adjustments', count(*) from public.standings_adjustments where league_id = wanted
  union all select 'public.standings_coin_flips', count(*) from public.standings_coin_flips where league_id = wanted
  union all select 'public.standings_rows', count(*) from public.standings_rows where league_id = wanted
  union all select 'public.support_access_log', count(*) from public.support_access_log where league_id = wanted
  union all select 'public.teams', count(*) from public.teams where league_id = wanted
  union all select 'public.venues', count(*) from public.venues where league_id = wanted;
end
$$;

revoke all on function public.league_rows(uuid) from public;

comment on function public.league_rows(uuid) is
  'How many rows each table with a league_id column holds for one league (step 2.150; sites and site_releases since 0020, standings_coin_flips since 0025): a written list of the tables, which a test checks against the catalog. Table owner only.';
