-- 0008: people (T3 §3), teams and roster entries (T3 §7), the team scope of role
-- grants and invitations (T3 §5), and the unique-jersey switch as a real column on
-- seasons (T3 §12, T-44). Decision record 022 (T-234) explains the choices T3 left
-- open.
--
-- Every table follows 0002 and 0005: a version 7 UUID id, created_at and
-- updated_at, a version moved by on_row_update (T-46), a league_id that every link
-- includes (T-40), and its one forced row-level security policy keyed to the league
-- (T-61). People and teams go to the bin (`deleted_at`, T-45). A roster entry is
-- not binned: a player who leaves gets a `left_on` date and stays in the team's
-- history (R-17, T-52); an entry made by mistake is removed.
--
-- Rules the database enforces here (T-47):
-- - a person belongs to one league; a profile is linked to at most one person in a
--   league (while not in the bin); a person is never merged into themselves;
-- - a team belongs to a season of its league, and its division to the same season;
--   its short name and its name are unique in its season (while not in the bin),
--   and a lineage has at most one team in a season;
-- - a roster entry's team and person are the same league's (a roster entry cannot
--   point at another league's team or person, T3 §1); a person is on a team at most
--   once at a time; a jersey number is 0 to 99 or 00;
-- - while a season's rules ask for unique jersey numbers, no two people on one team
--   wear the same number at once (T3 §12); switching the rule on is refused while a
--   team already has two;
-- - a coach or captain grant, and such an invitation, points at a team of the same
--   league.
--
-- Not built yet: `people.photo` and `teams.logo` link to uploaded images, so they
-- wait for the `assets` table (stage 3), as `seasons.logo` does; `teams.club_id`
-- waits for the `clubs` table. Club scopes stay refused until that table exists.

-- People (T3 §3) ------------------------------------------------------------------

-- A person as one league knows them. A person added by hand has no profile; claiming
-- or registering fills it in, and rosters and statistics point here, so nothing
-- moves when the link is made. Erasing a person (R-17, T-52) empties the name,
-- contact details, birth date and link in place, so the row and its history stay:
-- that is why the names may be empty. The people commands (step 2.17) ask for a name
-- when an admin adds someone.
create table public.people (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  profile_id uuid references public.profiles (id),
  first_name text not null default '',
  last_name text not null default '',
  public_name text,
  contact_email text,
  birth_date date,
  -- Null when the league does not know (it never asked for a birth date).
  is_minor boolean,
  -- What the person asked for on public pages (R-15, R-17): nothing, initials, or
  -- off the league's public pages (their numbers stay, as a nameless entry). The
  -- one name function applies it (T-81).
  visibility text not null default 'none',
  merged_into_id uuid,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_league_id_key unique (league_id, id),
  constraint people_first_name_length check (length(first_name) <= 100),
  constraint people_last_name_length check (length(last_name) <= 100),
  constraint people_public_name_length check (
    public_name is null or length(btrim(public_name)) between 1 and 100
  ),
  constraint people_contact_email_format check (
    contact_email is null
    or (length(contact_email) <= 320 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
  ),
  constraint people_birth_date_plausible check (birth_date is null or birth_date >= date '1900-01-01'),
  constraint people_visibility check (visibility in ('none', 'initials', 'removed')),
  -- A duplicate merged into the person kept; both are the same league's.
  constraint people_merged_into foreign key (league_id, merged_into_id)
    references public.people (league_id, id),
  constraint people_not_merged_into_self check (merged_into_id is distinct from id),
  constraint people_version_positive check (version > 0)
);

-- A profile is one person in a league. A person in the bin lets the link go;
-- restoring checks it again.
create unique index people_profile_once
  on public.people (league_id, profile_id)
  where profile_id is not null and deleted_at is null;
create index people_profile_lookup on public.people (profile_id) where profile_id is not null;
create index people_merged_into_lookup
  on public.people (merged_into_id) where merged_into_id is not null;

comment on table public.people is
  'A person as one league knows them (T3 §3, R-3). profile_id is empty until the person is claimed or registers; erasure (T-52) empties the personal columns in place.';

-- Teams (T3 §7) ---------------------------------------------------------------------

create table public.teams (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  division_id uuid,
  slug text not null,
  name text not null,
  color text,
  -- S-22: who sees the team's players' numbers. No default: the league sets the
  -- starting level (step 2.14), so the command that makes a team chooses.
  stats_visibility text not null,
  -- The same team across seasons. A new team gets its own; carrying a team over
  -- to a new season gives the new row the old one's.
  lineage_id uuid not null default public.uuid_v7(),
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_league_id_key unique (league_id, id),
  -- What a game names (step 2.3), so both its teams are of its season.
  constraint teams_season_id_key unique (league_id, season_id, id),
  constraint teams_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  -- A division of the same season, or none.
  constraint teams_division foreign key (league_id, season_id, division_id)
    references public.divisions (league_id, season_id, id),
  constraint teams_slug_format check (length(slug) <= 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint teams_name_length check (length(btrim(name)) between 1 and 120),
  -- Empty: the league's own colors (T5 §1).
  constraint teams_color_format check (color is null or color ~ '^#[0-9a-f]{6}$'),
  -- S-22's four levels: everyone, signed-in members of the league, the team's own
  -- players, parents and staff, or only the team's staff and the league's admins.
  -- The two middle ones arrive with accounts (stage 4); until then the name
  -- function shows only the team's totals for them.
  constraint teams_stats_visibility check (
    stats_visibility in ('everyone', 'members', 'team', 'staff')
  ),
  constraint teams_version_positive check (version > 0)
);

-- A team's address (T-34) and the name the fixture import and the Al-Hadi transfer
-- match by (steps 2.10, 2.58) are unique in its season; a team in the bin lets
-- both go.
create unique index teams_slug_key
  on public.teams (league_id, season_id, slug) where deleted_at is null;
create unique index teams_name_key
  on public.teams (league_id, season_id, lower(btrim(name))) where deleted_at is null;
create unique index teams_one_per_lineage
  on public.teams (league_id, season_id, lineage_id) where deleted_at is null;
create index teams_lineage_lookup on public.teams (league_id, lineage_id);
create index teams_division_lookup on public.teams (division_id) where division_id is not null;

comment on table public.teams is
  'A team in one season (T3 §7). Its division is of the same season; its short name and name are unique in the season; lineage_id ties it to the same team in other seasons.';

-- Roster entries (T3 §7) --------------------------------------------------------------

create table public.roster_entries (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  team_id uuid not null,
  person_id uuid not null,
  -- 0 to 99, or 00 (a different jersey from 0), as the tracker takes them. Empty:
  -- no number yet.
  jersey_number text,
  role text not null default 'player',
  joined_on date,
  -- Set when the person leaves; the entry and its history stay (R-17, T-52).
  left_on date,
  sort integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_entries_league_id_key unique (league_id, id),
  constraint roster_entries_team foreign key (league_id, team_id)
    references public.teams (league_id, id),
  constraint roster_entries_person foreign key (league_id, person_id)
    references public.people (league_id, id),
  constraint roster_entries_jersey_format check (
    jersey_number is null or jersey_number ~ '^(0|00|[1-9][0-9]?)$'
  ),
  constraint roster_entries_role check (role in ('player', 'captain', 'coach')),
  constraint roster_entries_dates_in_order check (
    left_on is null or joined_on is null or left_on >= joined_on
  ),
  constraint roster_entries_sort_range check (sort between 0 and 100000),
  constraint roster_entries_version_positive check (version > 0)
);

-- A person is on a team once at a time; after leaving, they may join again.
create unique index roster_entries_once
  on public.roster_entries (team_id, person_id) where left_on is null;
create index roster_entries_team_lookup on public.roster_entries (team_id, sort);
create index roster_entries_person_lookup on public.roster_entries (person_id);

comment on table public.roster_entries is
  'A person on a team (T3 §7), with their jersey number and role. Leaving sets left_on; the entry stays (R-17, T-52). Team and person are the same league''s (T-40).';

-- The unique-jersey switch (T3 §12, T-44) ----------------------------------------------

-- The switch is part of the season's rules document (step 2.5, rosters.uniqueJerseys),
-- which the season commands set (step 2.15). The database needs it as a real column
-- to enforce it, so the column is worked out from the document and can never
-- disagree with it. Anything other than JSON true (a missing rosters part, an older
-- document) is off.
alter table public.seasons
  add column unique_jerseys boolean not null generated always as (
    coalesce(rules #> '{rosters,uniqueJerseys}' = 'true'::jsonb, false)
  ) stored;

comment on column public.seasons.unique_jerseys is
  'Worked out from rules.rosters.uniqueJerseys: while true, no two people on one team of this season wear the same number at once (T3 §12).';

-- One season's jersey numbers are checked one transaction at a time: a roster write
-- with a number and a season switching the rule on take the same per-season lock,
-- then look. That relies on READ COMMITTED, the default: the look after the lock
-- takes a fresh snapshot, so it sees what another transaction committed while this
-- one waited. Under REPEATABLE READ the snapshot is older than the lock and could
-- miss a number or the switch, so those writes are refused there (as for division
-- parents, 0007). SERIALIZABLE is fine: Postgres itself fails one of two clashing
-- transactions. These run as the caller: a team, its season and its roster are one
-- league's, which the fence lets the app see whole.
create or replace function public.check_roster_jersey() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  team_season uuid;
begin
  -- No number, or no longer on the team: nothing to clash with.
  if new.jersey_number is null or new.left_on is not null then
    return new;
  end if;
  select t.season_id into team_season
  from public.teams t where t.league_id = new.league_id and t.id = new.team_id;
  -- No such team: roster_entries_team answers that.
  if team_season is null then
    return new;
  end if;
  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'a jersey number cannot be set in a repeatable read transaction'
      using errcode = 'invalid_transaction_state', constraint = 'roster_entries_jersey_isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('roster_jerseys:' || team_season::text, 0));
  if exists (
    select 1 from public.seasons s where s.id = team_season and s.unique_jerseys
  ) and exists (
    select 1 from public.roster_entries r
    where r.team_id = new.team_id
      and r.jersey_number = new.jersey_number
      and r.left_on is null
      and r.id <> new.id
  ) then
    raise exception 'jersey number % is already worn on this team', new.jersey_number
      using errcode = 'unique_violation', constraint = 'roster_entries_unique_jersey',
            hint = 'This season asks for unique jersey numbers in a team.';
  end if;
  return new;
end
$$;

comment on function public.check_roster_jersey() is
  'BEFORE INSERT OR UPDATE on roster_entries: while the season asks for unique jerseys, refuses a number already worn by someone on the team.';

create trigger roster_entries_unique_jersey
  before insert or update of jersey_number, left_on, team_id on public.roster_entries
  for each row execute function public.check_roster_jersey();

create or replace function public.check_season_unique_jerseys() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'the unique-jersey rule cannot be switched on in a repeatable read transaction'
      using errcode = 'invalid_transaction_state', constraint = 'roster_entries_jersey_isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('roster_jerseys:' || new.id::text, 0));
  if exists (
    select 1
    from public.roster_entries r
    join public.teams t on t.league_id = r.league_id and t.id = r.team_id
    where t.league_id = new.league_id
      and t.season_id = new.id
      and r.jersey_number is not null
      and r.left_on is null
    group by r.team_id, r.jersey_number
    having count(*) > 1
  ) then
    raise exception 'a team in this season already has two people wearing one number'
      using errcode = 'unique_violation', constraint = 'seasons_unique_jerseys_clash',
            hint = 'Change one of the numbers first, then switch the rule on.';
  end if;
  return null;
end
$$;

comment on function public.check_season_unique_jerseys() is
  'AFTER UPDATE on seasons, when the unique-jersey rule is switched on: refuses while a team of the season already has a number worn twice.';

create trigger seasons_unique_jerseys_on
  after update of rules on public.seasons
  for each row when (new.unique_jerseys and not old.unique_jerseys)
  execute function public.check_season_unique_jerseys();

-- Team scopes for role grants and invitations (T3 §5) ---------------------------------

-- As for programs (0004): a generated column holds scope_id only for a team scope,
-- with a foreign key on (league_id, scope_team_id), so a coach or captain grant
-- points at a team of the same league. Club scopes stay refused until clubs exist.
alter table public.role_grants
  add column scope_team_id uuid generated always as (
    case when scope_type = 'team' then scope_id end
  ) stored;
alter table public.role_grants
  add constraint role_grants_scope_team foreign key (league_id, scope_team_id)
    references public.teams (league_id, id);
alter table public.role_grants drop constraint role_grants_scope_available;
alter table public.role_grants
  add constraint role_grants_scope_available check (scope_type in ('league', 'program', 'team'));

alter table public.invitations
  add column scope_team_id uuid generated always as (
    case when scope_type = 'team' then scope_id end
  ) stored;
alter table public.invitations
  add constraint invitations_scope_team foreign key (league_id, scope_team_id)
    references public.teams (league_id, id);
alter table public.invitations drop constraint invitations_scope_available;
alter table public.invitations
  add constraint invitations_scope_available check (scope_type in ('league', 'program', 'team'));

create index role_grants_scope_team_lookup
  on public.role_grants (scope_team_id) where scope_team_id is not null;
create index invitations_scope_team_lookup
  on public.invitations (scope_team_id) where scope_team_id is not null;

comment on table public.role_grants is
  'This account has this role in this league: for the whole league, one program, or one team (coach, captain) (T3 §5, A-3). Removing access sets revoked_at.';

-- Every editable table moves version and updated_at on each change --------------------

-- A team stays in its season; a roster entry stays with its team and person (moving
-- a player is leaving one team and joining another, so the history stays true).
create trigger people_on_update before update on public.people
  for each row execute function public.on_row_update();
create trigger teams_on_update before update on public.teams
  for each row execute function public.on_row_update('season_id');
create trigger roster_entries_on_update before update on public.roster_entries
  for each row execute function public.on_row_update('team_id', 'person_id');

-- What app_user may do (as for divisions in 0007) -------------------------------------

grant select, insert, update, delete on public.people to app_user;
grant select, insert, update, delete on public.teams to app_user;
grant select, insert, update, delete on public.roster_entries to app_user;

-- Row-level security: on, forced, one policy keyed to the league (T-61) -------------

alter table public.people enable row level security;
alter table public.people force row level security;
alter table public.teams enable row level security;
alter table public.teams force row level security;
alter table public.roster_entries enable row level security;
alter table public.roster_entries force row level security;

create policy people_league_fence on public.people
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy teams_league_fence on public.teams
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy roster_entries_league_fence on public.roster_entries
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

select migration_log.revoke_hosted_api_roles();
