-- 0017: removing a league made by mistake (step 2.150, record 063, T-266; U-9, T-45,
-- T-220, record 057).
--
-- `npm run league:make` makes a draft league with its default program, its first
-- season and two activity-log entries naming our staff. Until now nothing could take
-- such a league away again: app_user may not delete a league (0005), and the league's
-- own activity-log rows are history (T-45), which only purge_league_history may
-- remove, and only for a league 30 days in the bin (T-220). This adds:
--
-- 1. The platform's own log, `platform.activity_log`: what our staff did to the
--    platform itself, kept after the league it is about is gone. No link to a
--    league (the league's id is kept as a plain uuid, with its short name and name,
--    which are not personal); the staff member by account id only (T-220: history
--    keeps ids, never copies of personal details). Rows are only ever added: the same
--    refuse_history_change trigger as every history table, which never lets a row of
--    this table go (it has no league_id for a purge to name). In a schema of its own
--    that app_user cannot use: nothing in the app reads it yet, so the app's login
--    gets nothing (record 063).
-- 2. `league_rows(league)`: how many rows every table with a league_id column holds
--    for one league, each named; a test that walks the catalog fails when a league
--    table is not named there, so one added later cannot be forgotten.
-- 3. `league_removal_problems(league)`: why a league is not exactly what the maker
--    writes (empty when it is). Read-only: the tool's plan shows it.
-- 4. `remove_draft_league(league, typed short name, staff account)`: for the league
--    this transaction is set to only, it locks the league row, asks
--    league_removal_problems again under that lock, writes the platform log entry,
--    lets the history delete through for that one league for that one call (its own
--    transaction-local setting, put back at once, as purge_league_history does),
--    and removes the league's two activity-log rows, its season, its program and the
--    league itself. Anything else is refused with nothing changed.
--
-- All three functions run as their caller (not SECURITY DEFINER), with EXECUTE
-- revoked from everyone: only the tables' owner, the migration login, may run them,
-- and each first refuses a role that row-level security still fences, which would
-- count too few rows and could pass a league in use.
--
-- Safe to run twice: the schema, table and indexes are made only if missing;
-- functions and the trigger are replaced. Nothing is dropped or renamed (T-183).

-- 1. The platform's own log ------------------------------------------------------------

create schema if not exists platform;

revoke all on schema platform from public;

comment on schema platform is
  'What our staff did to the platform itself (step 2.150, record 063). Only the tables'' owner reaches it; app_user cannot use it.';

create table if not exists platform.activity_log (
  id uuid primary key default public.uuid_v7(),
  action text not null,
  -- The league the entry is about, which may no longer exist: a plain id, no link.
  removed_league_id uuid not null,
  league_slug text not null,
  league_name text not null,
  actor_account_id uuid not null references public.accounts (id),
  details jsonb not null default '{}',
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint platform_activity_log_action check (action in ('leagues.remove_draft')),
  constraint platform_activity_log_slug_format check (league_slug ~ '^[a-z0-9-]{3,40}$'),
  constraint platform_activity_log_name_length check (
    length(btrim(league_name)) between 1 and 120
  ),
  constraint platform_activity_log_details_object check (jsonb_typeof(details) = 'object')
);

create index if not exists platform_activity_log_league
  on platform.activity_log (removed_league_id, at desc);

comment on table platform.activity_log is
  'Who of our staff changed the platform itself, and when (step 2.150): today only a draft league removed. History: rows are only ever added (T-45). Ids only, no personal details (T-220).';

revoke all on table platform.activity_log from public;

alter table platform.activity_log enable row level security;
alter table platform.activity_log force row level security;

create or replace trigger platform_activity_log_is_history
  before update or delete on platform.activity_log
  for each row execute function public.refuse_history_change();

-- 2. Every table's rows of one league ------------------------------------------------------

-- Every table with a league_id column, by name. No dynamic SQL (T-183's check reads
-- the text): instead a test walks the catalog and fails when a table with a league_id
-- column is missing here (league-rows.test.ts), so a league table added later cannot
-- be forgotten; the migration that adds one adds it here too.
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
  union all select 'public.stages', count(*) from public.stages where league_id = wanted
  union all select 'public.standings_adjustments', count(*) from public.standings_adjustments where league_id = wanted
  union all select 'public.standings_rows', count(*) from public.standings_rows where league_id = wanted
  union all select 'public.support_access_log', count(*) from public.support_access_log where league_id = wanted
  union all select 'public.teams', count(*) from public.teams where league_id = wanted
  union all select 'public.venues', count(*) from public.venues where league_id = wanted;
end
$$;

revoke all on function public.league_rows(uuid) from public;

comment on function public.league_rows(uuid) is
  'How many rows each table with a league_id column holds for one league, found from the catalog when it runs (step 2.150). Table owner only.';

-- 3. Why a league is not exactly what the maker writes -------------------------------------

create or replace function public.league_removal_problems(wanted uuid) returns text[]
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  found_league public.leagues;
  problems text[] := '{}';
  maker uuid;
  counted record;
begin
  perform public.require_view_of_every_league();
  select * into found_league from public.leagues l where l.id = wanted;
  if not found then
    return array['not-found'];
  end if;

  -- The league itself: in draft, not in the bin, never changed since it was made
  -- (every change moves `version`, 0002), and with no agreement or wording of its own.
  if found_league.status <> 'draft' then
    problems := problems || ('state:' || found_league.status);
  end if;
  if found_league.deleted_at is not null then
    problems := problems || 'in-bin'::text;
  end if;
  if found_league.version <> 1
     or found_league.agreement is not null
     or found_league.wording <> '{"version": 1}'::jsonb then
    problems := problems || 'league-changed'::text;
  end if;

  -- Its one program: the default one createLeague made, never changed.
  if (select count(*) from public.programs p where p.league_id = wanted) <> 1
     or not exists (
       select 1 from public.programs p
       where p.league_id = wanted and p.is_default and p.deleted_at is null and p.version = 1
     ) then
    problems := problems || 'program-changed'::text;
  end if;

  -- At most one season: in draft, not in the bin, with the rules and statistics it
  -- was made with, and changed only by being made the current one (version 2).
  if (select count(*) from public.seasons s where s.league_id = wanted) > 1
     or exists (
       select 1 from public.seasons s
       where s.league_id = wanted
         and (s.status <> 'draft' or s.deleted_at is not null or s.version > 2
              or s.rules <> '{"version": 1}'::jsonb or s.stat_keys <> '{}')
     ) then
    problems := problems || 'season-changed'::text;
  end if;

  -- The activity log: only what the maker writes. One `leagues.create`, at most one
  -- `leagues.create_season`, both by the same account, and nothing else at all.
  select g.actor_account_id into maker
  from public.activity_log g where g.league_id = wanted and g.action = 'leagues.create';
  if (select count(*) from public.activity_log g
      where g.league_id = wanted and g.action = 'leagues.create') <> 1
     or maker is null
     or (select count(*) from public.activity_log g
         where g.league_id = wanted and g.action = 'leagues.create_season') > 1
     or exists (
       select 1 from public.activity_log g
       where g.league_id = wanted
         and (g.action not in ('leagues.create', 'leagues.create_season')
              or g.actor_account_id is distinct from maker)
     ) then
    problems := problems || 'activity'::text;
  end if;

  -- Every other table with a league_id column: nothing at all. Grants (even ended
  -- ones), invitations, settings, people, teams, games, jobs, receipts, support
  -- visits, a former short name, anything in the bin, and any table added later.
  for counted in select * from public.league_rows(wanted) loop
    if counted.table_name in ('public.programs', 'public.seasons', 'public.activity_log') then
      continue;
    end if;
    if counted.row_count > 0 then
      problems := problems || ('rows:' || counted.table_name || ':' || counted.row_count);
    end if;
  end loop;
  return problems;
end
$$;

revoke all on function public.league_removal_problems(uuid) from public;

comment on function public.league_removal_problems(uuid) is
  'Why a league is not exactly what the internal tool makes (step 2.150): empty when it may be removed. Reads only. Table owner only.';

-- 4. Removing it -------------------------------------------------------------------------

create or replace function public.remove_draft_league(
  removed_league uuid,
  typed_slug text,
  staff_account uuid
) returns table (outcome text, problems text[], entry_id uuid)
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
declare
  found_league public.leagues;
  found_problems text[];
  entry uuid;
begin
  perform public.require_view_of_every_league();
  -- The league fence the other way round: only the league, and the staff member,
  -- this transaction is set to, never one named by an argument alone.
  if removed_league is null
     or public.current_league_id() is distinct from removed_league
     or staff_account is null
     or public.current_account_id() is distinct from staff_account then
    raise exception 'remove_draft_league: the transaction is not set to that league and account'
      using errcode = 'insufficient_privilege';
  end if;

  -- Locked first: a row added to any league table takes a share lock on this row
  -- (every league_id links to leagues), so nothing can be added between the checks
  -- below and the delete; whatever was added before is seen by them.
  select * into found_league from public.leagues l where l.id = removed_league for update;
  if not found then
    return query select 'not-found'::text, '{}'::text[], null::uuid;
    return;
  end if;
  if typed_slug is distinct from found_league.slug then
    return query select 'short-name-differs'::text, '{}'::text[], null::uuid;
    return;
  end if;
  found_problems := public.league_removal_problems(removed_league);
  if cardinality(found_problems) > 0 then
    return query select 'in-use'::text, found_problems, null::uuid;
    return;
  end if;

  -- Written before anything goes, in the same transaction: the entry exists exactly
  -- when the league is gone.
  insert into platform.activity_log
    (action, removed_league_id, league_slug, league_name, actor_account_id, details)
  values (
    'leagues.remove_draft', found_league.id, found_league.slug, found_league.name,
    staff_account, jsonb_build_object('ownerAccountId', found_league.owner_account_id)
  )
  returning id into entry;

  -- The league's own two log rows go with it: the history rule lets them through for
  -- this league only, until the setting is put back on the next line (T-220).
  perform set_config('srleagues.history_purge', removed_league::text, true);
  delete from public.activity_log where league_id = removed_league;
  perform set_config('srleagues.history_purge', '', true);

  delete from public.seasons where league_id = removed_league;
  delete from public.programs where league_id = removed_league;
  delete from public.leagues where id = removed_league;
  return query select 'removed'::text, '{}'::text[], entry;
end
$$;

revoke all on function public.remove_draft_league(uuid, text, uuid) from public;

comment on function public.remove_draft_league(uuid, text, uuid) is
  'Removes a draft league that is exactly what the internal tool makes, for the league and staff account this transaction is set to (step 2.150, record 063). Table owner only.';

select migration_log.revoke_hosted_api_roles();
