-- 0005: the app's database role and row-level security, the third fence (T4 §2,
-- T-60 to T-64, T-221, decision record 008).
--
-- - app_user is the role the web app and worker act as (T-60). It cannot log in by
--   itself (the login that uses it is made outside migrations, because its password
--   is a secret), is not a superuser, cannot bypass row-level security, create
--   databases or roles, and owns nothing: it has no CREATE on any schema, so it
--   cannot make a table, and the history purge (T-220, record 007) stays out of its
--   reach. It never gets TRUNCATE, which fires no row triggers and would empty
--   history (T3 §12). History tables give it SELECT and INSERT only.
-- - At the start of each transaction the app sets two values for that transaction
--   only (T-61):
--     select set_config('app.league_id', <league id>, true),
--            set_config('app.account_id', <account id>, true);
--   public.current_league_id() and public.current_account_id() read them. A value
--   that is missing, empty or not a UUID reads as NULL, and NULL matches no row, so
--   a transaction that forgot to say which league it is for sees nothing and can
--   write nothing.
-- - Every league table allows only rows of the league that was set; `leagues`
--   itself only the row whose id was set. Each policy has the same test for reading
--   (USING) and writing (WITH CHECK), so a row cannot be written into another league
--   or moved there. To create a league, the app picks its id first (uuid_v7()),
--   sets it as the league, then inserts the league and its default program.
-- - Personal tables are keyed to the account (T-62): an account sees its own
--   `accounts` row, its own `profile_access` rows, and the profiles they name.
--   Creating an account or a profile, finding an account by email before anyone
--   is signed in, accepting an invitation by its token before a league is set, and
--   reading the names on a league's access list are not open to this role; record
--   008 (T-221) says how they come, in steps 1.12 to 1.14.
-- - Row-level security is forced, so it applies to the tables' owner too. Only a
--   superuser or a role with BYPASSRLS sees past it: the role that runs migrations.
-- - Some rules must look across leagues: a short name is free only if no other
--   league holds it (T3 §12), and a league must have a default program even if the
--   app changed which league it set before committing. Their trigger functions now
--   run as the owner (SECURITY DEFINER) and refuse to run at all if the owner could
--   not see every league, so a fenced view can never make them pass by mistake.
-- - A public page has a short name in its address and no league yet:
--   public.find_league_by_slug answers that one question, for one name at a time.
-- - Nothing in `public` is open to PUBLIC any more (T-64), and Supabase's API roles
--   (anon, authenticated, service_role), where they exist, are given nothing.
--
-- New tables and functions: the role that runs migrations no longer gives PUBLIC
-- EXECUTE on new functions, and nobody gets anything on new tables by default. A
-- migration that adds a table grants app_user what it needs, enables and forces
-- row-level security, and adds its policy; a test in
-- packages/database/src/schema/row-level-security.test.ts fails until it does. A
-- function used in a default, a CHECK or a policy needs GRANT EXECUTE to app_user.

-- The app's role ------------------------------------------------------------------

-- A role belongs to the whole database server, not to one database, so it may
-- already exist: made by this migration in another database on the same server, or
-- by hand. Then every attribute that is wrong is put right, and the migration stops
-- if the role is a member of another role, because it could act as that role.
do $$
declare
  existing pg_roles%rowtype;
begin
  select * into existing from pg_roles where rolname = 'app_user';
  if not found then
    create role app_user with nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    return;
  end if;
  -- Only what is wrong is changed: naming an attribute such as SUPERUSER at all needs
  -- powers the migration role may not have, even to set it to what it already is.
  if existing.rolcanlogin then
    alter role app_user with nologin;
  end if;
  if existing.rolsuper then
    alter role app_user with nosuperuser;
  end if;
  if existing.rolcreatedb then
    alter role app_user with nocreatedb;
  end if;
  if existing.rolcreaterole then
    alter role app_user with nocreaterole;
  end if;
  if existing.rolreplication then
    alter role app_user with noreplication;
  end if;
  if existing.rolbypassrls then
    alter role app_user with nobypassrls;
  end if;
  if exists (
    select 1 from pg_auth_members m where m.member = 'app_user'::regrole
  ) then
    raise exception 'app_user is a member of another role, so it could act as that role'
      using errcode = 'invalid_grant_operation',
            hint = 'Revoke that membership by hand, then run the migrations again (T-60).';
  end if;
end
$$;

comment on role app_user is
  'The web app and worker act as this role (T-60): no schema changes, no bypassing row-level security, owns nothing.';

-- Nobody but the owner makes objects in public, and only roles named here use it;
-- app_user may use it, not create in it.
revoke all on schema public from public;
grant usage on schema public to app_user;

-- Which league and account this transaction is for (T-61) -----------------------

create or replace function public.current_league_id() returns uuid
language sql
stable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  -- Only a UUID in its usual written form counts. Anything else, or nothing, is NULL.
  select case
    when setting ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then setting::uuid
  end
  from (select lower(current_setting('app.league_id', true)) as setting) as context
$$;

comment on function public.current_league_id() is
  'The league this transaction is for, from app.league_id (T-61); NULL when it is missing or not a UUID, which matches no row.';

create or replace function public.current_account_id() returns uuid
language sql
stable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case
    when setting ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then setting::uuid
  end
  from (select lower(current_setting('app.account_id', true)) as setting) as context
$$;

comment on function public.current_account_id() is
  'The signed-in account this transaction acts for, from app.account_id (T-61, T-62); NULL when it is missing or not a UUID.';

-- Rules that look across leagues --------------------------------------------------

-- Called first by every SECURITY DEFINER function that must see every league to be
-- right. Under a role that row-level security still fences, such a function would
-- see only part of the data and could pass something it should refuse.
create or replace function public.require_view_of_every_league() returns void
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from pg_roles r
    where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    raise exception 'role % is fenced by row-level security, so this check cannot see every league', current_user
      using errcode = 'insufficient_privilege',
            hint = 'The tables and these functions must be owned by the role that runs migrations, which bypasses row-level security.';
  end if;
end
$$;

comment on function public.require_view_of_every_league() is
  'Refuses unless the current role sees past row-level security. Guards the SECURITY DEFINER checks that must see every league.';

-- The same rules as in 0003, now run as the owner, with the guard first.
create or replace function public.check_league_slug_free() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.require_view_of_every_league();
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

create or replace function public.check_old_slug_free() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.require_view_of_every_league();
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

create or replace function public.check_league_has_default_program() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  league uuid;
begin
  perform public.require_view_of_every_league();
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

-- A public page knows only the short name in its address. This returns the league
-- it names, by its current name or a former one still forwarding (U-7), and nothing
-- else: its id, current name (to forward to), status and whether it is in the bin.
-- One name at a time, so it cannot list leagues. Run as the owner, it sees past the
-- fence; if the owner were fenced it would find nothing, which is safe.
create or replace function public.find_league_by_slug(wanted text)
returns table (league_id uuid, slug text, status text, in_bin boolean, forwarded boolean)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select l.id, l.slug, l.status, l.deleted_at is not null, false
  from public.leagues l
  where l.slug = wanted
  union all
  select l.id, l.slug, l.status, l.deleted_at is not null, true
  from public.league_slug_history h
  join public.leagues l on l.id = h.league_id
  where h.old_slug = wanted
    and h.expires_at > now()
    and not exists (select 1 from public.leagues current_name where current_name.slug = wanted)
  limit 1
$$;

comment on function public.find_league_by_slug(text) is
  'The league a short name in an address names, current or still forwarding (U-7): id, current short name, status, in the bin, forwarded. For pages with no league set yet (record 008).';

-- What app_user may do, table by table ---------------------------------------------

-- Personal tables (T-62). Accounts and profiles are created and erased by narrow
-- paths that come later (record 008); here an account reads and edits its own.
grant select, update on public.accounts to app_user;
grant select, update on public.profiles to app_user;
grant select on public.profile_access to app_user;

-- League tables. No DELETE where removal is a mark instead: a league goes to the
-- bin and its row is removed only with its history, by the owner (record 007); a
-- grant is revoked, an invitation cancelled.
grant select, insert, update on public.leagues to app_user;
grant select, insert, update, delete on public.league_slug_history to app_user;
grant select, insert, update, delete on public.league_features to app_user;
grant select, insert, update, delete on public.programs to app_user;
grant select, insert, update, delete on public.seasons to app_user;
grant select, insert, update on public.role_grants to app_user;
grant select, insert, update on public.invitations to app_user;

-- History (T-45): only ever added to. A support visit may be ended early, so that one
-- column may change; its triggers allow nothing else.
grant select, insert on public.activity_log to app_user;
grant select, insert on public.support_access_log to app_user;
grant update (ended_at) on public.support_access_log to app_user;
grant select, insert on public.command_receipts to app_user;

-- Functions: nothing in public is open to PUBLIC. app_user may run what defaults,
-- CHECK constraints and policies call, and the short-name lookup. Never
-- purge_league_history (record 007). Trigger functions need no grant to fire.
revoke all on all functions in schema public from public;
grant execute on function public.uuid_v7() to app_user;
grant execute on function public.is_versioned_document(jsonb) to app_user;
grant execute on function public.current_league_id() to app_user;
grant execute on function public.current_account_id() to app_user;
grant execute on function public.find_league_by_slug(text) to app_user;

-- Functions the migration role makes from now on are not open to PUBLIC either.
alter default privileges revoke execute on functions from public;

-- Row-level security: on and forced on every table ---------------------------------

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.profile_access enable row level security;
alter table public.profile_access force row level security;
alter table public.leagues enable row level security;
alter table public.leagues force row level security;
alter table public.league_slug_history enable row level security;
alter table public.league_slug_history force row level security;
alter table public.league_features enable row level security;
alter table public.league_features force row level security;
alter table public.programs enable row level security;
alter table public.programs force row level security;
alter table public.seasons enable row level security;
alter table public.seasons force row level security;
alter table public.role_grants enable row level security;
alter table public.role_grants force row level security;
alter table public.invitations enable row level security;
alter table public.invitations force row level security;
alter table public.activity_log enable row level security;
alter table public.activity_log force row level security;
alter table public.support_access_log enable row level security;
alter table public.support_access_log force row level security;
alter table public.command_receipts enable row level security;
alter table public.command_receipts force row level security;

-- Personal tables: keyed to the account (T-62). `(select ...)` reads the setting once
-- per statement rather than once per row.
create policy accounts_own_account on public.accounts
  using (id = (select public.current_account_id()))
  with check (id = (select public.current_account_id()));

create policy profile_access_own_rows on public.profile_access
  using (account_id = (select public.current_account_id()))
  with check (account_id = (select public.current_account_id()));

-- The profile_access rows read here are themselves fenced to the account.
create policy profiles_accessible on public.profiles
  using (exists (
    select 1 from public.profile_access pa
    where pa.profile_id = profiles.id and pa.account_id = (select public.current_account_id())
  ))
  with check (exists (
    select 1 from public.profile_access pa
    where pa.profile_id = profiles.id and pa.account_id = (select public.current_account_id())
  ));

-- League tables: keyed to the league (T-61).
create policy leagues_league_fence on public.leagues
  using (id = (select public.current_league_id()))
  with check (id = (select public.current_league_id()));

create policy league_slug_history_league_fence on public.league_slug_history
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy league_features_league_fence on public.league_features
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy programs_league_fence on public.programs
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy seasons_league_fence on public.seasons
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy role_grants_league_fence on public.role_grants
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy invitations_league_fence on public.invitations
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy activity_log_league_fence on public.activity_log
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy support_access_log_league_fence on public.support_access_log
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy command_receipts_league_fence on public.command_receipts
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

-- Supabase's API roles get nothing (T-64) -----------------------------------------

-- On Supabase, tables and functions the migration role makes are granted to anon,
-- authenticated and service_role by default, which the browser-facing API uses.
-- Those roles do not exist in local PostgreSQL, so the revokes are written out in a
-- function that runs each only where its role exists. A later migration that adds
-- tables may call it again.
create or replace function migration_log.revoke_hosted_api_roles() returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all functions in schema public from anon;
    revoke all on schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
    alter default privileges in schema public revoke all on functions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    revoke all on all functions in schema public from authenticated;
    revoke all on schema public from authenticated;
    alter default privileges in schema public revoke all on tables from authenticated;
    alter default privileges in schema public revoke all on sequences from authenticated;
    alter default privileges in schema public revoke all on functions from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on all tables in schema public from service_role;
    revoke all on all sequences in schema public from service_role;
    revoke all on all functions in schema public from service_role;
    revoke all on schema public from service_role;
    alter default privileges in schema public revoke all on tables from service_role;
    alter default privileges in schema public revoke all on sequences from service_role;
    alter default privileges in schema public revoke all on functions from service_role;
  end if;
end
$$;

revoke all on function migration_log.revoke_hosted_api_roles() from public;

comment on function migration_log.revoke_hosted_api_roles() is
  'Takes every privilege in public away from Supabase''s API roles, where they exist (T-64).';

select migration_log.revoke_hosted_api_roles();
