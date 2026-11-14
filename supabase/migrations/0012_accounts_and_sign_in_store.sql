-- 0012: accounts on the real database (step 2.92, decision record 052, T-256; carries
-- out T-221 and T-230, records 008 and 018).
--
-- 1. Which sign-in user an account is. Our account ids stay version 7 UUIDs that we
--    make (T-41). The sign-in service's own id for the person (Supabase's user id,
--    a version 4 UUID; another vendor's could be any text) is kept beside it in
--    accounts.sign_in_id, one account per sign-in user. Only the owner-run
--    functions below write it: app_user cannot.
-- 2. app_user may change only the columns the app may change on its own account:
--    the display name, the phone and when it was last seen (finding R9). The email
--    changes only through T-73's confirmed change, which is not built yet, so for
--    now nothing the app runs can change it.
-- 3. The sign-in store (record 018): what the Supabase adapter keeps for itself,
--    because Supabase does not. It is in a schema of its own, `sign_in`, reached
--    only by a role of its own, `sign_in_store`, which can touch nothing else.
--    app_user cannot use the schema at all, so a mistake in league code cannot
--    reach a session, a count or a code's proof, and a mistake in the store cannot
--    reach a league. Every table there has row-level security forced, with one
--    policy that lets only sign_in_store in.
-- 4. The owner-run functions record 008 assigned to the sign-in and access steps:
--    the account for a sign-in (finding by email or creating, without saying
--    which), the account of a sign-in (every request), the account's own profile,
--    erasing an account, and the names on the access list of the league that is
--    set. Each follows record 008's rules and is in the reviewed list in
--    packages/database/src/schema/app-role.test.ts.

-- 1. Which sign-in user an account is ----------------------------------------------

alter table public.accounts add column sign_in_id text;

alter table public.accounts add constraint accounts_sign_in_id_format check (
  sign_in_id is null or (sign_in_id = btrim(sign_in_id) and length(sign_in_id) between 1 and 200)
);

create unique index accounts_sign_in_id_key on public.accounts (sign_in_id);

comment on column public.accounts.sign_in_id is
  'The sign-in service''s own id for this person (Supabase''s user id). Empty for an account no one has signed in to yet, and after erasure (record 052).';

-- 2. What app_user may change on its own account (R9, T-73) -------------------------

revoke update on public.accounts from app_user;
grant update (display_name, phone, last_seen_at) on public.accounts to app_user;

-- 3. The sign-in store -------------------------------------------------------------

-- The store's role, made and put right like app_user (0005): it cannot log in by
-- itself, has no powers, and must not be a member of another role. The app's login
-- is made a member of it by hand, as it is of app_user (record 052).
do $$
declare
  existing pg_roles%rowtype;
begin
  select * into existing from pg_roles where rolname = 'sign_in_store';
  if not found then
    create role sign_in_store with nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    return;
  end if;
  if existing.rolcanlogin then
    alter role sign_in_store with nologin;
  end if;
  if existing.rolsuper then
    alter role sign_in_store with nosuperuser;
  end if;
  if existing.rolcreatedb then
    alter role sign_in_store with nocreatedb;
  end if;
  if existing.rolcreaterole then
    alter role sign_in_store with nocreaterole;
  end if;
  if existing.rolreplication then
    alter role sign_in_store with noreplication;
  end if;
  if existing.rolbypassrls then
    alter role sign_in_store with nobypassrls;
  end if;
  if exists (
    select 1 from pg_auth_members m where m.member = 'sign_in_store'::regrole
  ) then
    raise exception 'sign_in_store is a member of another role, so it could act as that role'
      using errcode = 'invalid_grant_operation',
            hint = 'Revoke that membership by hand, then run the migrations again (record 052).';
  end if;
end
$$;

comment on role sign_in_store is
  'The sign-in store acts as this role (record 052): its own schema only, no league data, no powers.';

create schema sign_in;
revoke all on schema sign_in from public;
grant usage on schema sign_in to sign_in_store;

comment on schema sign_in is
  'What the sign-in adapter keeps that the sign-in service does not (record 018). Only sign_in_store and the tables'' owner reach it.';

-- An account that has finished signing up through us, by a code and a password or
-- by Google (record 018). A sign-in user left behind by a sign-up never finished is
-- not one.
create table sign_in.users (
  user_id text primary key,
  has_password boolean not null default false,
  created_at timestamptz not null default now(),
  constraint users_user_id_length check (length(user_id) between 1 and 200)
);

-- The devices an account has used (T-70), by the app's own device cookie.
create table sign_in.devices (
  user_id text not null references sign_in.users (user_id),
  device_id text not null,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, device_id),
  constraint devices_device_id_length check (length(device_id) between 1 and 200)
);

-- The session list (T-71). Tokens only as SHA-256 (`..._hash`). An ended session stays
-- listed as ended, as in the in-memory store.
create table sign_in.sessions (
  session_id text primary key,
  user_id text not null,
  device_label text not null,
  signed_in_at timestamptz not null,
  last_active_at timestamptz not null,
  last_sign_in_at timestamptz not null,
  password_entered_at timestamptz,
  access_token_hash text not null,
  access_expires_at timestamptz not null,
  refresh_token_hash text not null,
  ended boolean not null default false,
  constraint sessions_session_id_length check (length(session_id) between 1 and 200),
  constraint sessions_user_id_length check (length(user_id) between 1 and 200),
  constraint sessions_device_label_length check (length(device_label) <= 200)
);

create unique index sessions_access_token_hash_key on sign_in.sessions (access_token_hash);
create index sessions_user_live on sign_in.sessions (user_id) where not ended;

-- Every renewing token a session was given, so one used again reads as old (T-69).
create table sign_in.refresh_tokens (
  token_hash text primary key,
  session_id text not null references sign_in.sessions (session_id) on delete cascade,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index refresh_tokens_session on sign_in.refresh_tokens (session_id);

-- The code an address asked for: which check it answers (none when no code was sent,
-- T-68), when it runs out and the attempts left. The code itself is Supabase's.
create table sign_in.codes (
  email text primary key,
  verify_type text,
  expires_at timestamptz not null,
  attempts_left integer not null,
  constraint codes_email_length check (length(email) between 1 and 320),
  constraint codes_verify_type check (verify_type in ('signup', 'magiclink', 'recovery')),
  constraint codes_attempts_left check (attempts_left >= 0)
);

-- A proof between a right code and a new password: it holds the tokens of the
-- Supabase session the code made, at most 15 minutes, and is forgotten when taken
-- or run out (record 018).
create table sign_in.proofs (
  proof_hash text primary key,
  email text not null,
  user_id text not null,
  expires_at timestamptz not null,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  vendor_session_id text not null,
  constraint proofs_email_length check (length(email) between 1 and 320)
);

create index proofs_email on sign_in.proofs (email);
create index proofs_expires_at on sign_in.proofs (expires_at);

-- Codes asked for, per address and per network, for the hourly limits (T-225).
create table sign_in.code_requests (
  id uuid primary key,
  scope text not null,
  subject text not null,
  asked_at timestamptz not null,
  constraint code_requests_scope check (scope in ('email', 'network'))
);

create index code_requests_subject on sign_in.code_requests (scope, subject, asked_at);

-- Wrong guesses, per address typed and per network (T-85, T-225). A guess is counted
-- before it is checked and taken back if it was right; `ticket` ties the two counts
-- of one try together.
create table sign_in.guesses (
  id uuid primary key,
  ticket uuid not null,
  scope text not null,
  subject text not null,
  counted_at timestamptz not null,
  constraint guesses_scope check (scope in ('email', 'network'))
);

create index guesses_subject on sign_in.guesses (scope, subject, counted_at);
create index guesses_ticket on sign_in.guesses (ticket);

-- An address or network locked for a while, by the guess that locked it.
create table sign_in.guess_locks (
  scope text not null,
  subject text not null,
  locked_until timestamptz not null,
  by_guess_id uuid not null,
  primary key (scope, subject),
  constraint guess_locks_scope check (scope in ('email', 'network'))
);

-- What sign_in_store may do: only what the store's methods need. Nothing is ever
-- removed from users, devices or sessions by the store; erasure is the owner's.
grant select, insert, update on sign_in.users to sign_in_store;
grant select, insert on sign_in.devices to sign_in_store;
grant select, insert, update on sign_in.sessions to sign_in_store;
grant select, insert, update on sign_in.refresh_tokens to sign_in_store;
grant select, insert, update, delete on sign_in.codes to sign_in_store;
grant select, insert, update, delete on sign_in.proofs to sign_in_store;
grant select, insert, delete on sign_in.code_requests to sign_in_store;
grant select, insert, delete on sign_in.guesses to sign_in_store;
grant select, insert, update, delete on sign_in.guess_locks to sign_in_store;

alter table sign_in.users enable row level security;
alter table sign_in.users force row level security;
alter table sign_in.devices enable row level security;
alter table sign_in.devices force row level security;
alter table sign_in.sessions enable row level security;
alter table sign_in.sessions force row level security;
alter table sign_in.refresh_tokens enable row level security;
alter table sign_in.refresh_tokens force row level security;
alter table sign_in.codes enable row level security;
alter table sign_in.codes force row level security;
alter table sign_in.proofs enable row level security;
alter table sign_in.proofs force row level security;
alter table sign_in.code_requests enable row level security;
alter table sign_in.code_requests force row level security;
alter table sign_in.guesses enable row level security;
alter table sign_in.guesses force row level security;
alter table sign_in.guess_locks enable row level security;
alter table sign_in.guess_locks force row level security;

-- One policy per table, for sign_in_store only: any other role given a grant here by
-- mistake would still see nothing.
create policy users_store_only on sign_in.users
  to sign_in_store using (true) with check (true);
create policy devices_store_only on sign_in.devices
  to sign_in_store using (true) with check (true);
create policy sessions_store_only on sign_in.sessions
  to sign_in_store using (true) with check (true);
create policy refresh_tokens_store_only on sign_in.refresh_tokens
  to sign_in_store using (true) with check (true);
create policy codes_store_only on sign_in.codes
  to sign_in_store using (true) with check (true);
create policy proofs_store_only on sign_in.proofs
  to sign_in_store using (true) with check (true);
create policy code_requests_store_only on sign_in.code_requests
  to sign_in_store using (true) with check (true);
create policy guesses_store_only on sign_in.guesses
  to sign_in_store using (true) with check (true);
create policy guess_locks_store_only on sign_in.guess_locks
  to sign_in_store using (true) with check (true);

-- Supabase's API roles get nothing here either (T-64), where they exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema sign_in from anon;
    revoke all on schema sign_in from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema sign_in from authenticated;
    revoke all on schema sign_in from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on all tables in schema sign_in from service_role;
    revoke all on schema sign_in from service_role;
  end if;
end
$$;

-- 4. The owner-run functions (record 008, T-221) --------------------------------------

-- Every request of a signed-in person: which of our accounts the sign-in service's
-- user is. One sign-in id at a time, returning the account id or nothing, so it
-- cannot list accounts, and it takes no email, so it cannot be asked whether an
-- address has an account. Fenced, its owner would find nothing, which is safe: the
-- request is then a visitor's.
create or replace function public.account_of_sign_in(wanted text) returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select a.id from public.accounts a where a.sign_in_id = wanted
$$;

comment on function public.account_of_sign_in(text) is
  'The account a sign-in service user is, or NULL (record 052). For every signed-in request, before an account is set.';

-- Once the sign-in service has proved the person holds the mailbox (a right code,
-- Google, or a right password): the account for that sign-in user. It is the one
-- already linked to it; else the account with that email, which it links (an account
-- made for an address before its owner first signed in, such as a league owner set
-- up by hand); else a new account it makes. It returns the id and never says which
-- of the three it was (T-68). An address whose account is linked to another sign-in
-- user is refused, not moved: that happens only if the service's user was made
-- again, and is put right by hand. One address at a time, so two first sign-ins at
-- once make one account.
create or replace function public.account_for_sign_in(given_sign_in_id text, given_email text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  found_id uuid;
  found_link text;
begin
  perform public.require_view_of_every_league();
  if given_sign_in_id is null or given_email is null then
    raise exception 'a sign-in id and an email are both needed'
      using errcode = 'null_value_not_allowed';
  end if;
  -- Erased accounts keep a placeholder address on the reserved .invalid domain
  -- (record 007); no mailbox there can be proved, so none may be signed in to.
  if lower(given_email) like '%.invalid' then
    raise exception 'an address on the .invalid domain cannot sign in'
      using errcode = 'check_violation', constraint = 'accounts_email_format';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account_email:' || lower(given_email), 0));

  select a.id into found_id from public.accounts a where a.sign_in_id = given_sign_in_id;
  if found then
    return found_id;
  end if;

  select a.id, a.sign_in_id into found_id, found_link
  from public.accounts a where lower(a.email) = lower(given_email);
  if found then
    if found_link is not null then
      raise exception 'the account for this address belongs to another sign-in user'
        using errcode = 'unique_violation', constraint = 'accounts_sign_in_id_key',
              hint = 'The sign-in service made this person again; link the account by hand (record 052).';
    end if;
    update public.accounts set sign_in_id = given_sign_in_id where id = found_id;
    return found_id;
  end if;

  insert into public.accounts (email, sign_in_id)
  values (given_email, given_sign_in_id)
  returning id into found_id;
  return found_id;
end
$$;

comment on function public.account_for_sign_in(text, text) is
  'The account for a sign-in user whose mailbox the sign-in service has proved: linked, found by email and linked, or made (record 052). Never says which (T-68).';

-- The account's own profile (T3 §3), made when the person first gives their name.
-- Only for the account set in the transaction, and only once: an account is itself
-- at most once. It returns the new profile's id, or NULL when the account already
-- has its own profile (then nothing changes). Two at once: the second is refused by
-- profile_access_one_self_per_account.
create or replace function public.create_own_profile(
  given_first_name text,
  given_last_name text,
  given_birth_date date
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  me uuid := public.current_account_id();
  made uuid;
begin
  if me is null then
    raise exception 'no account is set for this transaction'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.accounts a where a.id = me) then
    raise exception 'the account set for this transaction does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if exists (
    select 1 from public.profile_access pa where pa.account_id = me and pa.relation = 'self'
  ) then
    return null;
  end if;
  insert into public.profiles (first_name, last_name, birth_date)
  values (given_first_name, given_last_name, given_birth_date)
  returning id into made;
  insert into public.profile_access (account_id, profile_id, relation)
  values (me, made, 'self');
  return made;
end
$$;

comment on function public.create_own_profile(text, text, date) is
  'Makes the own profile of the account set for this transaction, once (record 052).';

-- Erasing an account (T-52, T-220, record 007): only the account set for this
-- transaction, as its own request. Its row stays, emptied in place, so history keeps
-- valid links. Its profiles go: its own and those it acts for as a guardian that no
-- other account reaches; one another account still reaches stays with that account.
-- Its grants in every league end now. Its rows in the sign-in store go. It refuses,
-- changing nothing, while the account owns a league (the league would have no one
-- to run it) or while one of its profiles is still linked to a league's person:
-- each league treats its person first, inside its own fence (T-52, T-63). Ending the
-- person's user at the sign-in service is the caller's. It answers 'erased',
-- 'owns-a-league' or 'profile-in-a-league', so a refusal leaves the transaction
-- usable.
create or replace function public.erase_account() returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  me uuid;
  link text;
  address text;
  going uuid[];
begin
  perform public.require_view_of_every_league();
  me := public.current_account_id();
  if me is null then
    raise exception 'no account is set for this transaction'
      using errcode = 'insufficient_privilege';
  end if;
  select a.sign_in_id, a.email into link, address from public.accounts a where a.id = me for update;
  if not found then
    raise exception 'the account set for this transaction does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from public.leagues l where l.owner_account_id = me) then
    return 'owns-a-league';
  end if;

  select coalesce(array_agg(mine.profile_id), '{}') into going
  from public.profile_access mine
  where mine.account_id = me
    and not exists (
      select 1 from public.profile_access other
      where other.profile_id = mine.profile_id and other.account_id <> me
    );
  if exists (select 1 from public.people p where p.profile_id = any (going)) then
    return 'profile-in-a-league';
  end if;

  delete from public.profile_access pa where pa.account_id = me;
  delete from public.profiles pr where pr.id = any (going);

  update public.role_grants g
  set revoked_at = now(), revoked_by_account_id = me
  where g.account_id = me and g.revoked_at is null;

  if link is not null then
    delete from sign_in.sessions s where s.user_id = link;
    delete from sign_in.devices d where d.user_id = link;
    delete from sign_in.users u where u.user_id = link;
    delete from sign_in.proofs p where p.user_id = link;
  end if;
  delete from sign_in.codes c where lower(c.email) = lower(address);
  delete from sign_in.proofs p where lower(p.email) = lower(address);

  update public.accounts a
  set email = me::text || '@erased.invalid',
      display_name = null,
      phone = null,
      last_seen_at = null,
      sign_in_id = null
  where a.id = me;
  return 'erased';
end
$$;

comment on function public.erase_account() is
  'Erases the account set for this transaction, at its own request: the row emptied in place, its profiles, grants and sign-in rows gone (record 052, T-52, T-220).';

-- The names on the access list (P4 §6) of the league set for this transaction: the
-- display name of each account holding a grant in force there, and of its owner, and
-- nothing else about them. With no league set it returns nothing. Who may read the
-- list is the access module's check (access.manage), made before this is called.
create or replace function public.access_list_names()
returns table (account_id uuid, display_name text)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select a.id, a.display_name
  from public.accounts a
  where a.id in (
    select g.account_id from public.role_grants g
    where g.league_id = public.current_league_id() and g.revoked_at is null
    union
    select l.owner_account_id from public.leagues l
    where l.id = public.current_league_id()
  )
  order by a.id
$$;

comment on function public.access_list_names() is
  'Display names of the accounts on the access list of the league set for this transaction: grants in force and the owner (record 008, record 052).';

grant execute on function public.account_of_sign_in(text) to app_user;
grant execute on function public.account_for_sign_in(text, text) to app_user;
grant execute on function public.create_own_profile(text, text, date) to app_user;
grant execute on function public.erase_account() to app_user;
grant execute on function public.access_list_names() to app_user;

-- New functions are not open to PUBLIC (0005's default), and Supabase's API roles
-- get none of them.
select migration_log.revoke_hosted_api_roles();
