-- 0020: a league's site, and the published versions of it (step 2.187, record 073,
-- T-277; T3 §10, T5 §1 and §5, P5 §2 and §5, A-9, C-3, C-16, T-45, T-96).
--
-- Until now nothing in the database kept a league's design: every league on the
-- database was drawn in the neutral starting design. This adds T3's two tables for a
-- league's site:
--
--   site_releases: one published version of the whole site, never changed or removed
--     once written (history, T-45, T-96): its number in the league (1, 2, 3...), the
--     starting design it began from (`starting_design`, a key such as "crest"), its
--     design (`design`, the design document of T5 §1, which core checks against the
--     written schema in packages/contracts before it is ever written), its menu and its
--     pages (`menu`, `pages`: empty documents, {"version": 1}, until the design editor
--     of a later step fills them), who published it and when. The public site is drawn
--     from the league's latest release, never from a draft (A-9, C-3).
--   sites: the league's site in its draft state, one row per league: the starting
--     design and design being edited (`design_draft`), the menu being edited
--     (`menu_draft`, empty for now) and the release it points at
--     (`published_release_id`). Publishing writes a new release and points the site at
--     it, in one transaction. Until the editor exists, a publish also sets the draft to
--     what it published, so the editor will open on the published design.
--
-- The database checks the shape it can check: each document is an object that names its
-- format version (T-44, T-50), within a size; a starting design's key is a short
-- lower-case word; a release's number is 1 or more and taken once in its league. Which
-- values a design may hold (a color only as #rrggbb, a font from the list, a word from a
-- fixed list) is the schema's in code, checked when a design is published and again
-- when it is read for a page, so a document that does not pass is never drawn.
--
-- Both tables follow 0002 and 0005: a version 7 id, a league_id that every link
-- includes (T-40), and one forced row-level security policy keyed to the league
-- (T-61). The site is editable (a version moved by on_row_update, T-46); a release is
-- history (refuse_history_change), so app_user may add releases and read them, never
-- change or remove one.
--
-- Leagues that already exist (the founder's test copy holds made-up ones) get no rows
-- here: a league with no release is drawn in the neutral starting design, exactly as
-- every league is drawn today, until a design is published for it. Nothing is written
-- for them because a release is history that can never be taken back, and a design
-- chosen by a migration would be one the league never published.
--
-- The draft-league removal of 0017 is brought up to date in the same file: league_rows
-- counts the two new tables; a league exactly as the internal tool makes it may now
-- hold the one site and first release the tool gives it (published by the same staff
-- account, never changed since), and removing it takes them with it; and the purge of
-- a league 30 days in the bin (0010) removes its site and releases with its history.
--
-- Safe to run twice: tables and indexes are made only if missing, the policies are put
-- back as they are, functions and triggers are replaced. Nothing is dropped or renamed
-- (T-183).

-- Published versions of a league's site --------------------------------------------------

create table if not exists public.site_releases (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  number integer not null,
  starting_design text not null,
  design jsonb not null,
  menu jsonb not null default '{"version": 1}',
  pages jsonb not null default '{"version": 1}',
  published_by_account_id uuid not null references public.accounts (id),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint site_releases_league_id_key unique (league_id, id),
  -- One release of each number in a league: two publishes at once cannot both be next.
  constraint site_releases_number_key unique (league_id, number),
  constraint site_releases_number_positive check (number >= 1),
  constraint site_releases_starting_design_format check (
    starting_design ~ '^[a-z][a-z0-9-]{0,39}$'
  ),
  constraint site_releases_design_document check (public.is_versioned_document(design)),
  constraint site_releases_menu_document check (public.is_versioned_document(menu)),
  constraint site_releases_pages_document check (public.is_versioned_document(pages)),
  -- A design is a handful of colors and words; a menu and the pages are bigger.
  constraint site_releases_design_size check (octet_length(design::text) <= 8192),
  constraint site_releases_menu_size check (octet_length(menu::text) <= 65536),
  constraint site_releases_pages_size check (octet_length(pages::text) <= 1048576)
);

create index if not exists site_releases_publisher_lookup
  on public.site_releases (published_by_account_id);

comment on table public.site_releases is
  'A published version of a league''s whole site: its starting design, design, menu and pages (T3 §10). History: never changed or removed (T-45, T-96). The public site is drawn from the latest one (A-9, C-3).';

-- A league's site in its draft state ---------------------------------------------------------

create table if not exists public.sites (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  starting_design text not null,
  design_draft jsonb not null,
  menu_draft jsonb not null default '{"version": 1}',
  published_release_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_league_id_key unique (league_id, id),
  constraint sites_one_per_league unique (league_id),
  -- The release it points at is one of its own league's.
  constraint sites_published_release foreign key (league_id, published_release_id)
    references public.site_releases (league_id, id),
  constraint sites_starting_design_format check (starting_design ~ '^[a-z][a-z0-9-]{0,39}$'),
  constraint sites_design_draft_document check (public.is_versioned_document(design_draft)),
  constraint sites_menu_draft_document check (public.is_versioned_document(menu_draft)),
  constraint sites_design_draft_size check (octet_length(design_draft::text) <= 8192),
  constraint sites_menu_draft_size check (octet_length(menu_draft::text) <= 65536),
  constraint sites_version_positive check (version > 0)
);

create index if not exists sites_published_release_lookup
  on public.sites (league_id, published_release_id) where published_release_id is not null;

comment on table public.sites is
  'A league''s site in its draft state: the design and menu being edited, and the release it points at (T3 §10). One per league.';

-- A site is edited; a release is history -----------------------------------------------------

create or replace trigger sites_on_update before update on public.sites
  for each row execute function public.on_row_update();
create or replace trigger site_releases_is_history before update or delete on public.site_releases
  for each row execute function public.refuse_history_change();

-- What app_user may do ------------------------------------------------------------------------

grant select, insert, update on public.sites to app_user;
grant select, insert on public.site_releases to app_user;

-- Row-level security: on, forced, one policy keyed to the league (T-61) -------------------------

alter table public.sites enable row level security;
alter table public.sites force row level security;
alter table public.site_releases enable row level security;
alter table public.site_releases force row level security;

drop policy if exists sites_league_fence on public.sites;
create policy sites_league_fence on public.sites
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

drop policy if exists site_releases_league_fence on public.site_releases;
create policy site_releases_league_fence on public.site_releases
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

-- 0017's league_rows, counting the two new tables ---------------------------------------------

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
  union all select 'public.standings_rows', count(*) from public.standings_rows where league_id = wanted
  union all select 'public.support_access_log', count(*) from public.support_access_log where league_id = wanted
  union all select 'public.teams', count(*) from public.teams where league_id = wanted
  union all select 'public.venues', count(*) from public.venues where league_id = wanted;
end
$$;

revoke all on function public.league_rows(uuid) from public;

-- Replacing a function keeps its old comment, so each replaced function's comment is
-- written again here, saying what it now does (0020).
comment on function public.league_rows(uuid) is
  'How many rows each table with a league_id column holds for one league (step 2.150; sites and site_releases since 0020): a written list of the tables, which a test checks against the catalog. Table owner only.';

-- 0017's league_removal_problems, which now lets the tool's first release through -------------

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
  -- was made with, and exactly as the maker leaves it: made, then made the current one
  -- (version 2 and current). A season changed in any other way, even once, is refused.
  if (select count(*) from public.seasons s where s.league_id = wanted) > 1
     or exists (
       select 1 from public.seasons s
       where s.league_id = wanted
         and (s.status <> 'draft' or s.deleted_at is not null
              or not (s.version = 2 and s.is_current)
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

  -- Its site (0020): none, or exactly the one the maker gives a new league with it: a
  -- first release published by the maker, and the site pointing at it, never changed
  -- since (version 1). A second release, or any change to the draft, is refused.
  if (select count(*) from public.site_releases r where r.league_id = wanted) > 1
     or (select count(*) from public.sites s where s.league_id = wanted)
        <> (select count(*) from public.site_releases r where r.league_id = wanted)
     or exists (
       select 1 from public.site_releases r
       where r.league_id = wanted
         and (r.number <> 1 or r.published_by_account_id is distinct from maker)
     )
     or exists (
       select 1 from public.sites s
       where s.league_id = wanted
         and (s.version <> 1
              or s.published_release_id is null
              or not exists (
                select 1 from public.site_releases r
                where r.league_id = wanted and r.id = s.published_release_id
              ))
     ) then
    problems := problems || 'site-changed'::text;
  end if;

  -- Every other table with a league_id column: nothing at all. Grants (even ended
  -- ones), invitations, settings, people, teams, games, jobs, receipts, support
  -- visits, a former short name, anything in the bin, and any table added later.
  for counted in select * from public.league_rows(wanted) loop
    if counted.table_name in (
      'public.programs', 'public.seasons', 'public.activity_log',
      'public.sites', 'public.site_releases'
    ) then
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
  'Why a league is not exactly what the internal tool makes (step 2.150; since 0020, step 2.187: no site, or the one site and first release the tool gives it, published by its maker and never changed, else site-changed): empty when it may be removed. Reads only. Table owner only.';

-- 0017's remove_draft_league, which now takes the site and its first release with it ----------

create or replace function public.remove_draft_league(
  removed_league uuid,
  typed_slug text,
  staff_account uuid,
  shown_version integer,
  shown_created_at timestamptz,
  typed_owner_email text
) returns table (outcome text, problems text[], entry_id uuid)
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
declare
  found_league public.leagues;
  found_problems text[];
  owner_email text;
  owner_signed_in boolean;
  maker uuid;
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
  -- The very league the plan showed: the same row, unchanged since.
  if shown_version is distinct from found_league.version
     or shown_created_at is distinct from found_league.created_at then
    return query select 'changed-since-plan'::text, '{}'::text[], null::uuid;
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
  -- An owner who has signed in (or was erased) will find their league gone: the
  -- person must also type the owner's email, exactly. Read after the lock, so a
  -- sign-in that landed since the plan is seen.
  select a.email, a.sign_in_id is not null or a.email like '%@erased.invalid'
    into owner_email, owner_signed_in
  from public.accounts a where a.id = found_league.owner_account_id;
  if owner_signed_in is distinct from false and typed_owner_email is distinct from owner_email then
    return query select 'owner-email-differs'::text, '{}'::text[], null::uuid;
    return;
  end if;

  -- Written before anything goes, in the same transaction: the entry exists exactly
  -- when the league is gone. Besides the league, it keeps what its own two log rows
  -- said, which go with it: who made it and when, and who plays (ids, a time and a
  -- fixed word only, T-220).
  select g.actor_account_id into maker
  from public.activity_log g where g.league_id = removed_league and g.action = 'leagues.create';
  insert into platform.activity_log
    (action, removed_league_id, league_slug, league_name, actor_account_id, details)
  values (
    'leagues.remove_draft', found_league.id, found_league.slug, found_league.name,
    staff_account,
    jsonb_build_object(
      'ownerAccountId', found_league.owner_account_id,
      'madeByAccountId', maker,
      'madeAt', found_league.created_at,
      'audience', found_league.audience
    )
  )
  returning id into entry;

  -- The league's own two log rows and its first release go with it: the history rule
  -- lets them through for this league only, until the setting is put back (T-220). The
  -- site points at the release, so it goes first.
  perform set_config('srleagues.history_purge', removed_league::text, true);
  delete from public.activity_log where league_id = removed_league;
  delete from public.sites where league_id = removed_league;
  delete from public.site_releases where league_id = removed_league;
  perform set_config('srleagues.history_purge', '', true);

  delete from public.seasons where league_id = removed_league;
  delete from public.programs where league_id = removed_league;
  delete from public.leagues where id = removed_league;
  return query select 'removed'::text, '{}'::text[], entry;
end
$$;

revoke all on function public.remove_draft_league(uuid, text, uuid, integer, timestamptz, text)
  from public;

comment on function public.remove_draft_league(uuid, text, uuid, integer, timestamptz, text) is
  'Removes a draft league that is exactly what the internal tool makes, with its site and first release when it has them (0020, step 2.187), for the league and staff account this transaction is set to (step 2.150, record 063). Table owner only.';

-- 0010's purge of a league 30 days in the bin, which now takes its site with its history ------

create or replace function public.purge_league_history(purged_league uuid) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.leagues l
    where l.id = purged_league and l.deleted_at <= now() - interval '30 days'
  ) then
    raise exception 'league % has not been in the bin for 30 days; its history stays', purged_league
      using errcode = 'restrict_violation';
  end if;
  perform set_config('srleagues.history_purge', purged_league::text, true);
  delete from public.activity_log where league_id = purged_league;
  delete from public.support_access_log where league_id = purged_league;
  delete from public.command_receipts where league_id = purged_league;
  -- A draft names the revision it was based on; the purge removes the league's
  -- drafts with everything else, so they go first.
  delete from public.schedule_drafts where league_id = purged_league;
  delete from public.schedule_revisions where league_id = purged_league;
  delete from public.game_corrections where league_id = purged_league;
  delete from public.game_events where league_id = purged_league;
  -- The same for the site (0020): it points at a release, so it goes first.
  delete from public.sites where league_id = purged_league;
  delete from public.site_releases where league_id = purged_league;
  perform set_config('srleagues.history_purge', '', true);
end
$$;

revoke all on function public.purge_league_history(uuid) from public;

comment on function public.purge_league_history(uuid) is
  'Removes the history of a league that has been in the bin for 30 days, its site and site releases with it since 0020 (T-51, T-220). Table owner only.';

-- Supabase's API roles get none of it.
select migration_log.revoke_hosted_api_roles();
