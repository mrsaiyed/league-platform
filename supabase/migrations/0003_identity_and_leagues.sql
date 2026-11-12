-- 0003: accounts and people (T3 §3), leagues and their structure (T3 §4).
--
-- Conventions (0002): every id is a version 7 UUID; times are timestamptz (UTC);
-- every editable table has `version` and the on_row_update trigger. Things the bin
-- can restore (T-45) have `deleted_at`: leagues, programs and seasons. Accounts and
-- profiles do not, because deleting an account erases it (T-52) rather than
-- binning it.
--
-- League tables carry `league_id`, and every link between two league tables
-- includes it (T-40): a child names (league_id, parent_id) and the parent has a
-- unique (league_id, id), so a row cannot point at another league's row.
--
-- Rules the database enforces here (T3 §12 and T3 §4):
-- - a league short name is unique across leagues and unexpired forwarding history;
-- - every league has exactly one default program (checked when the transaction
--   that creates or changes it commits);
-- - at most one current season per program.
--
-- Row-level security comes in the next step (1.7); this file adds none.

-- Accounts and people ---------------------------------------------------------

create table public.accounts (
  id uuid primary key default public.uuid_v7(),
  email text not null,
  display_name text,
  phone text,
  last_seen_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_email_format check (
    email = btrim(email) and length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
  ),
  constraint accounts_display_name_length check (
    display_name is null or length(btrim(display_name)) between 1 and 100
  ),
  constraint accounts_phone_length check (phone is null or length(phone) between 3 and 32),
  constraint accounts_version_positive check (version > 0)
);

-- One account per email, whatever its capitals (T3 §3).
create unique index accounts_email_key on public.accounts (lower(email));

comment on table public.accounts is
  'A sign-in: one per email (case-insensitive), not tied to any league (T3 §3, U-11).';

create table public.profiles (
  id uuid primary key default public.uuid_v7(),
  first_name text not null,
  last_name text not null,
  birth_date date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_length check (length(btrim(first_name)) between 1 and 100),
  constraint profiles_last_name_length check (length(btrim(last_name)) between 1 and 100),
  constraint profiles_birth_date_plausible check (birth_date is null or birth_date >= date '1900-01-01'),
  constraint profiles_version_positive check (version > 0)
);

comment on table public.profiles is
  'A human being an account can act for: the account holder, or a child (T3 §3).';

create table public.profile_access (
  id uuid primary key default public.uuid_v7(),
  account_id uuid not null references public.accounts (id),
  profile_id uuid not null references public.profiles (id),
  relation text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_access_relation check (relation in ('self', 'guardian')),
  constraint profile_access_once unique (account_id, profile_id),
  constraint profile_access_version_positive check (version > 0)
);

-- An account is itself at most once, and a profile is at most one account's self.
create unique index profile_access_one_self_per_account
  on public.profile_access (account_id) where relation = 'self';
create unique index profile_access_one_self_per_profile
  on public.profile_access (profile_id) where relation = 'self';
create index profile_access_profile on public.profile_access (profile_id);

comment on table public.profile_access is
  'Which account may act for which profile: as themselves (self) or as a guardian (T3 §3).';

-- Leagues ---------------------------------------------------------------------

create table public.leagues (
  id uuid primary key default public.uuid_v7(),
  slug text not null,
  name text not null,
  status text not null default 'draft',
  time_zone text not null,
  audience text not null,
  contact_email text,
  listed boolean not null,
  owner_account_id uuid not null references public.accounts (id),
  agreement jsonb,
  wording jsonb not null default '{"version": 1}',
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- U-7: 3 to 40 lowercase letters, numbers and hyphens. The blocked list is
  -- checked by the leagues module.
  constraint leagues_slug_format check (slug ~ '^[a-z0-9-]{3,40}$'),
  constraint leagues_name_length check (length(btrim(name)) between 1 and 120),
  -- U-9.
  constraint leagues_status check (status in ('draft', 'live', 'archived', 'suspended')),
  constraint leagues_time_zone_present check (length(time_zone) between 1 and 64),
  constraint leagues_audience check (audience in ('adult', 'youth', 'mixed')),
  constraint leagues_contact_email_format check (
    contact_email is null
    or (length(contact_email) <= 320 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
  ),
  constraint leagues_agreement_document check (
    agreement is null or public.is_versioned_document(agreement)
  ),
  constraint leagues_wording_document check (public.is_versioned_document(wording)),
  constraint leagues_version_positive check (version > 0)
);

-- Unique across the platform, including leagues in the bin (they may come back).
create unique index leagues_slug_key on public.leagues (slug);
create index leagues_owner on public.leagues (owner_account_id);

comment on table public.leagues is
  'A customer and its site (T3 §4). The short name (slug) is unique across leagues and unexpired forwarding history (T3 §12, U-7).';

create table public.league_slug_history (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  old_slug text not null,
  expires_at timestamptz not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_slug_history_slug_format check (old_slug ~ '^[a-z0-9-]{3,40}$'),
  constraint league_slug_history_expires_after_created check (expires_at > created_at),
  constraint league_slug_history_version_positive check (version > 0)
);

create index league_slug_history_slug on public.league_slug_history (old_slug, expires_at);
create index league_slug_history_league on public.league_slug_history (league_id);

comment on table public.league_slug_history is
  'A former short name still forwarding to its league until expires_at (U-7: 12 months). No other league may take it until then.';

-- The short-name rule (T3 §12) spans two tables and depends on the time, so it
-- is a trigger on each. Both take the same per-name lock first, so two
-- transactions claiming one name at once are checked one after the other.
create or replace function public.check_league_slug_free() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('league_slug:' || new.slug, 0));
  if exists (
    select 1 from public.league_slug_history h
    where h.old_slug = new.slug and h.league_id <> new.id and h.expires_at > now()
  ) then
    raise exception 'the short name "%" still forwards to another league', new.slug
      using errcode = 'unique_violation', constraint = 'leagues_slug_not_forwarding',
            hint = 'A former short name is held for its league until its forwarding expires (U-7).';
  end if;
  return new;
end
$$;

create trigger leagues_slug_free
  before insert or update of slug on public.leagues
  for each row execute function public.check_league_slug_free();

create or replace function public.check_old_slug_free() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('league_slug:' || new.old_slug, 0));
  if new.expires_at <= now() then
    return new;
  end if;
  if exists (
    select 1 from public.leagues l where l.slug = new.old_slug and l.id <> new.league_id
  ) or exists (
    select 1 from public.league_slug_history h
    where h.old_slug = new.old_slug and h.league_id <> new.league_id
      and h.id <> new.id and h.expires_at > now()
  ) then
    raise exception 'the short name "%" belongs to another league', new.old_slug
      using errcode = 'unique_violation', constraint = 'league_slug_history_slug_free';
  end if;
  return new;
end
$$;

create trigger league_slug_history_slug_free
  before insert or update on public.league_slug_history
  for each row execute function public.check_old_slug_free();

create table public.league_features (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  feature_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{"version": 1}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_features_key_format check (feature_key ~ '^[a-z][a-z0-9_.]{0,63}$'),
  constraint league_features_once unique (league_id, feature_key),
  constraint league_features_config_document check (public.is_versioned_document(config)),
  constraint league_features_version_positive check (version > 0)
);

comment on table public.league_features is
  'An optional feature and whether it is switched on for one league, with its settings (T3 §4).';

-- Programs and seasons ----------------------------------------------------------

create table public.programs (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  slug text not null,
  name text not null,
  sport_key text not null,
  is_default boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_league_id_key unique (league_id, id),
  constraint programs_slug_format check (
    length(slug) <= 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint programs_name_length check (length(btrim(name)) between 1 and 120),
  constraint programs_sport_key_format check (sport_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- The default program is never in the bin: the league always has one.
  constraint programs_default_not_deleted check (not (is_default and deleted_at is not null)),
  constraint programs_version_positive check (version > 0)
);

-- At most one default program per league; the deferred trigger below makes it
-- exactly one.
create unique index programs_one_default on public.programs (league_id) where is_default;
-- A name in the bin does not hold its address; restoring checks it again.
create unique index programs_slug_key on public.programs (league_id, slug) where deleted_at is null;

comment on table public.programs is
  'A sport for a group within a league (T3 §4). Every league has exactly one default program, which single-program leagues never see (U-3, U-12).';

-- Exactly one default program: checked when the transaction commits, so the
-- league and its default program are created together, and the default can be
-- moved from one program to another inside one transaction.
create or replace function public.check_league_has_default_program() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  league uuid;
begin
  if tg_table_name = 'leagues' then
    league := new.id;
  else
    league := old.league_id;
  end if;
  if exists (select 1 from public.leagues l where l.id = league)
     and not exists (
       select 1 from public.programs p
       where p.league_id = league and p.is_default and p.deleted_at is null
     ) then
    raise exception 'league % has no default program', league
      using errcode = 'check_violation', constraint = 'leagues_have_default_program',
            hint = 'Create the league and its default program in the same transaction.';
  end if;
  return null;
end
$$;

create constraint trigger leagues_have_default_program
  after insert on public.leagues
  deferrable initially deferred
  for each row execute function public.check_league_has_default_program();

create constraint trigger programs_keep_default_program
  after update or delete on public.programs
  deferrable initially deferred
  for each row when (old.is_default)
  execute function public.check_league_has_default_program();

create table public.seasons (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  program_id uuid not null,
  slug text not null,
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'draft',
  is_current boolean not null default false,
  rules jsonb not null default '{"version": 1}',
  stat_keys text[] not null default '{}',
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_league_id_key unique (league_id, id),
  constraint seasons_program foreign key (league_id, program_id)
    references public.programs (league_id, id),
  constraint seasons_slug_format check (length(slug) <= 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint seasons_name_length check (length(btrim(name)) between 1 and 120),
  constraint seasons_dates_in_order check (ends_on is null or starts_on is null or ends_on >= starts_on),
  -- draft: being set up, admins only; active: running; completed: over, still shown.
  constraint seasons_status check (status in ('draft', 'active', 'completed')),
  constraint seasons_current_not_deleted check (not (is_current and deleted_at is not null)),
  constraint seasons_rules_document check (public.is_versioned_document(rules)),
  constraint seasons_version_positive check (version > 0)
);

-- T3 §12: only one season per program is marked current.
create unique index seasons_one_current on public.seasons (league_id, program_id) where is_current;
create unique index seasons_slug_key
  on public.seasons (league_id, program_id, slug) where deleted_at is null;

comment on table public.seasons is
  'One running of a program (T3 §4). At most one season per program is current (T3 §12).';

-- Every editable table moves version and updated_at on each change ------------

create trigger accounts_on_update before update on public.accounts
  for each row execute function public.on_row_update();
create trigger profiles_on_update before update on public.profiles
  for each row execute function public.on_row_update();
create trigger profile_access_on_update before update on public.profile_access
  for each row execute function public.on_row_update();
create trigger leagues_on_update before update on public.leagues
  for each row execute function public.on_row_update();
create trigger league_slug_history_on_update before update on public.league_slug_history
  for each row execute function public.on_row_update();
create trigger league_features_on_update before update on public.league_features
  for each row execute function public.on_row_update();
create trigger programs_on_update before update on public.programs
  for each row execute function public.on_row_update();
create trigger seasons_on_update before update on public.seasons
  for each row execute function public.on_row_update();
