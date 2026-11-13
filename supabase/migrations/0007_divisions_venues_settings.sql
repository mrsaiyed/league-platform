-- 0007: divisions, venues and courts (T3 §4), and the one table for setting values
-- set at league, program or season level (T5 §6, decision record 019, T-231).
--
-- Every table follows 0002 and 0005: a version 7 UUID id, created_at and
-- updated_at, a version moved by on_row_update (T-46), a league_id that every link
-- includes (T-40), and its one forced row-level security policy keyed to the league
-- (T-61). Divisions, venues and courts go to the bin (`deleted_at`, T-45); a
-- setting value is not binned: clearing it removes the row, and the lookup falls
-- back to the next level.
--
-- Rules the database enforces here (T-47):
-- - a division belongs to a season of its league, and its parent division to the
--   same season; a division is never its own ancestor;
-- - a court belongs to a venue of its league, and never moves to another venue;
-- - names are unique where people pick by name: a division among its siblings in
--   its season, a venue in its league, a court in its venue (while not in the bin);
--   the fixture import (step 2.10) matches venues and courts by name;
-- - a setting value is set once per key at each place (the league, one program,
--   one season), and its place never changes;
-- - colors are lower-case #rrggbb; a value is a small versioned document.

-- Divisions -------------------------------------------------------------------------

create table public.divisions (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  parent_division_id uuid,
  name text not null,
  color text,
  sort integer not null default 0,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint divisions_league_id_key unique (league_id, id),
  -- What a team or game names (steps 2.2, 2.3), so it cannot name a division of
  -- another season.
  constraint divisions_season_id_key unique (league_id, season_id, id),
  constraint divisions_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  -- A parent division is in the same season. Room for regions later (U-12).
  constraint divisions_parent foreign key (league_id, season_id, parent_division_id)
    references public.divisions (league_id, season_id, id),
  constraint divisions_not_own_parent check (parent_division_id is distinct from id),
  constraint divisions_name_length check (length(btrim(name)) between 1 and 120),
  -- Empty: the league's own colors (T5 §1).
  constraint divisions_color_format check (color is null or color ~ '^#[0-9a-f]{6}$'),
  constraint divisions_sort_range check (sort between 0 and 100000),
  constraint divisions_version_positive check (version > 0)
);

-- Siblings have different names, whatever their capitals; a name in the bin does
-- not hold its place. Top-level divisions (no parent) are siblings of each other.
create unique index divisions_name_key
  on public.divisions (league_id, season_id, parent_division_id, lower(btrim(name)))
  nulls not distinct
  where deleted_at is null;
create index divisions_parent_lookup
  on public.divisions (parent_division_id) where parent_division_id is not null;

comment on table public.divisions is
  'A group of teams sharing standings, in one season (T3 §4). A parent division is in the same season (U-12); a division is never its own ancestor.';

-- A division is never its own ancestor. Its own row as parent is refused by
-- divisions_not_own_parent; a longer loop (A under B, then B under A) is refused
-- here. The parent chain stays in one league (the foreign key includes league_id),
-- which the fence lets the app see whole, so this runs as the caller. One season's
-- tree is changed one transaction at a time, so two moves at once cannot make a
-- loop that each alone would not.
--
-- That relies on READ COMMITTED, the default isolation level: there, the search
-- below takes a fresh snapshot after the lock, so it sees a move another
-- transaction committed while this one waited. Under REPEATABLE READ the snapshot
-- is older than the lock and would miss that move, so a parent change is refused
-- there. SERIALIZABLE is fine: Postgres itself fails one of two clashing moves.
create or replace function public.check_division_parent_chain() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- No parent, or itself (divisions_not_own_parent answers that).
  if new.parent_division_id is null or new.parent_division_id = new.id then
    return new;
  end if;
  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'a division''s parent cannot change in a repeatable read transaction'
      using errcode = 'invalid_transaction_state', constraint = 'divisions_parent_isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('division_tree:' || new.season_id::text, 0));
  if exists (
    with recursive ancestors (id) as (
      select new.parent_division_id
      union
      select d.parent_division_id
      from public.divisions d
      join ancestors a on d.id = a.id
      where d.parent_division_id is not null
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'division % cannot sit under one of its own sub-divisions', new.id
      using errcode = 'check_violation', constraint = 'divisions_no_parent_loop';
  end if;
  return new;
end
$$;

comment on function public.check_division_parent_chain() is
  'BEFORE INSERT OR UPDATE OF parent_division_id on divisions: refuses a parent that is the division itself or one of its descendants.';

create trigger divisions_parent_chain
  before insert or update of parent_division_id on public.divisions
  for each row execute function public.check_division_parent_chain();

-- Venues and courts -------------------------------------------------------------------

create table public.venues (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  name text not null,
  address text,
  map_link text,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_league_id_key unique (league_id, id),
  constraint venues_name_length check (length(btrim(name)) between 1 and 120),
  constraint venues_address_length check (address is null or length(btrim(address)) between 1 and 300),
  -- A web address people open, never a script or a local file.
  constraint venues_map_link_format check (
    map_link is null or (length(map_link) <= 2000 and map_link ~ '^https://[^[:space:]]+$')
  ),
  constraint venues_version_positive check (version > 0)
);

create unique index venues_name_key
  on public.venues (league_id, lower(btrim(name))) where deleted_at is null;

comment on table public.venues is
  'A place games are played, in one league (T3 §4). Its name is unique in the league while not in the bin.';

create table public.courts (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  venue_id uuid not null,
  name text not null,
  sort integer not null default 0,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_league_id_key unique (league_id, id),
  -- What a game names (step 2.3), so its court is at its venue.
  constraint courts_venue_id_key unique (league_id, venue_id, id),
  constraint courts_venue foreign key (league_id, venue_id)
    references public.venues (league_id, id),
  constraint courts_name_length check (length(btrim(name)) between 1 and 120),
  constraint courts_sort_range check (sort between 0 and 100000),
  constraint courts_version_positive check (version > 0)
);

create unique index courts_name_key
  on public.courts (league_id, venue_id, lower(btrim(name))) where deleted_at is null;

comment on table public.courts is
  'A court at a venue (T3 §4). It belongs to one venue for good; its name is unique there while not in the bin.';

-- Setting values (T5 §6, record 019) ------------------------------------------------

-- A setting is declared in code with its key, schema, default, levels and
-- permission (T-98). A row here is a value an admin set for one key at one place:
-- the league, one program or one season. A lookup reads season, then program, then
-- league, then the declared default. "Not set" is no row, never a stored null.
--
-- `value` is a small versioned document, {"version": n, "value": <the value>}: the
-- version is the declared format of that setting's value, so a declaration can
-- upgrade an old value when it reads it (T-50). Its shape is checked by the
-- declaration's schema in code; the database checks only that it is that small
-- envelope.
create table public.setting_values (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  level text not null,
  program_id uuid,
  season_id uuid,
  key text not null,
  value jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setting_values_level check (level in ('league', 'program', 'season')),
  -- The level names its place, and only that place.
  constraint setting_values_place check (
    (level = 'league' and program_id is null and season_id is null)
    or (level = 'program' and program_id is not null and season_id is null)
    or (level = 'season' and season_id is not null and program_id is null)
  ),
  constraint setting_values_program foreign key (league_id, program_id)
    references public.programs (league_id, id),
  constraint setting_values_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  -- An area and a camelCase name, dotted: notifications.reminderLeadHours.
  constraint setting_values_key_format check (
    length(key) <= 100 and key ~ '^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$'
  ),
  constraint setting_values_value_document check (
    -- The case makes the object test come first: a check's "and" may be worked
    -- out in any order, and `-` on a bare string or number fails rather than
    -- answering false.
    case when jsonb_typeof(value) = 'object' then (
      public.is_versioned_document(value)
      and coalesce(jsonb_typeof(value -> 'value') <> 'null', false)
      and (value - 'version' - 'value') = '{}'::jsonb
    ) else false end
  ),
  constraint setting_values_value_size check (octet_length(value::text) <= 8192),
  constraint setting_values_version_positive check (version > 0)
);

-- One value per key at each place. The place check above makes the empty ids
-- follow from the level, so empty counts as equal here.
create unique index setting_values_once
  on public.setting_values (league_id, key, program_id, season_id) nulls not distinct;
create index setting_values_program_lookup
  on public.setting_values (program_id) where program_id is not null;
create index setting_values_season_lookup
  on public.setting_values (season_id) where season_id is not null;

comment on table public.setting_values is
  'A value an admin set for one declared setting at one place: the league, a program or a season (T5 §6, record 019). Read season, then program, then league, then the default.';

-- Every editable table moves version and updated_at on each change --------------------

-- A division stays in its season, a court at its venue, and a setting value at its
-- key and place: a different one is a new row.
create trigger divisions_on_update before update on public.divisions
  for each row execute function public.on_row_update('season_id');
create trigger venues_on_update before update on public.venues
  for each row execute function public.on_row_update();
create trigger courts_on_update before update on public.courts
  for each row execute function public.on_row_update('venue_id');
create trigger setting_values_on_update before update on public.setting_values
  for each row execute function public.on_row_update('level', 'program_id', 'season_id', 'key');

-- What app_user may do (as for programs and seasons in 0005) ------------------------

grant select, insert, update, delete on public.divisions to app_user;
grant select, insert, update, delete on public.venues to app_user;
grant select, insert, update, delete on public.courts to app_user;
grant select, insert, update, delete on public.setting_values to app_user;

-- Row-level security: on, forced, one policy keyed to the league (T-61) -------------

alter table public.divisions enable row level security;
alter table public.divisions force row level security;
alter table public.venues enable row level security;
alter table public.venues force row level security;
alter table public.courts enable row level security;
alter table public.courts force row level security;
alter table public.setting_values enable row level security;
alter table public.setting_values force row level security;

create policy divisions_league_fence on public.divisions
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy venues_league_fence on public.venues
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy courts_league_fence on public.courts
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy setting_values_league_fence on public.setting_values
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

select migration_log.revoke_hosted_api_roles();
