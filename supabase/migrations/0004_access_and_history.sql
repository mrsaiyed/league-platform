-- 0004: access (T3 §5), the logs, and command receipts (T3 §11).
--
-- Roles are the fixed list of A-3 (P4 §4). The owner is not a grant: it is
-- leagues.owner_account_id, so a league has exactly one. A grant applies to the
-- whole league or to one program; club and team scopes are in the list (T3 §5)
-- but refused by role_grants_scope_available and invitations_scope_available
-- until the clubs and teams tables exist, so no grant can point at nothing. The
-- migration that adds those tables also adds their links and lifts that check.
--
-- scope_id is one column for every kind of scope (T3 §5). So that it is still a
-- real link that includes league_id (T-40), each kind gets a generated column
-- holding scope_id only for that kind (scope_program_id), with a foreign key on
-- (league_id, scope_program_id).
--
-- A grant's account, role and scope, and an invitation's email, role and scope,
-- are fixed once the row exists: giving someone a different role is a new grant,
-- so the history of who could do what stays true.
--
-- History tables are only ever added to (T-45): activity_log and command_receipts
-- refuse every change and removal, so they have no updated_at or version. A
-- support visit (support_access_log) starts when its row is written and may only
-- be ended early, while it is still running; once over, it never changes. The one
-- removal is purge_league_history, for a league purged from the bin (T-220).
--
-- History keeps account ids, never copies of personal details: erasing an account
-- empties its accounts row in place (T-220), so every link here stays valid and
-- points at a row with nothing personal left in it.

create table public.role_grants (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  account_id uuid not null references public.accounts (id),
  role text not null,
  scope_type text not null default 'league',
  scope_id uuid,
  scope_program_id uuid generated always as (
    case when scope_type = 'program' then scope_id end
  ) stored,
  granted_by_account_id uuid references public.accounts (id),
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_grants_role check (
    role in ('admin', 'registrar', 'scheduler', 'editor', 'scorekeeper', 'club_admin', 'coach', 'captain')
  ),
  constraint role_grants_scope_type check (scope_type in ('league', 'program', 'club', 'team')),
  constraint role_grants_scope_id check ((scope_type = 'league') = (scope_id is null)),
  -- P4 §4: the league roles can be limited to one program; a club admin is for a
  -- club; a coach or captain is for a team.
  constraint role_grants_role_fits_scope check (
    (role in ('admin', 'registrar', 'scheduler', 'editor', 'scorekeeper')
      and scope_type in ('league', 'program'))
    or (role = 'club_admin' and scope_type = 'club')
    or (role in ('coach', 'captain') and scope_type = 'team')
  ),
  constraint role_grants_scope_available check (scope_type in ('league', 'program')),
  constraint role_grants_scope_program foreign key (league_id, scope_program_id)
    references public.programs (league_id, id),
  constraint role_grants_revoked_after_granted check (revoked_at is null or revoked_at >= created_at),
  constraint role_grants_version_positive check (version > 0)
);

-- One active grant of a role at a scope per account; revoked grants stay as history.
create unique index role_grants_one_active
  on public.role_grants (league_id, account_id, role, scope_type, scope_id) nulls not distinct
  where revoked_at is null;
create index role_grants_account_active
  on public.role_grants (account_id, league_id) where revoked_at is null;

comment on table public.role_grants is
  'This account has this role in this league, for the whole league or one program (T3 §5, A-3). Removing access sets revoked_at.';

create table public.invitations (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  email text not null,
  role text not null,
  scope_type text not null default 'league',
  scope_id uuid,
  scope_program_id uuid generated always as (
    case when scope_type = 'program' then scope_id end
  ) stored,
  token_hash text not null,
  invited_by_account_id uuid references public.accounts (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_account_id uuid references public.accounts (id),
  cancelled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_email_format check (
    email = btrim(email) and length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
  ),
  constraint invitations_role check (
    role in ('admin', 'registrar', 'scheduler', 'editor', 'scorekeeper', 'club_admin', 'coach', 'captain')
  ),
  constraint invitations_scope_type check (scope_type in ('league', 'program', 'club', 'team')),
  constraint invitations_scope_id check ((scope_type = 'league') = (scope_id is null)),
  constraint invitations_role_fits_scope check (
    (role in ('admin', 'registrar', 'scheduler', 'editor', 'scorekeeper')
      and scope_type in ('league', 'program'))
    or (role = 'club_admin' and scope_type = 'club')
    or (role in ('coach', 'captain') and scope_type = 'team')
  ),
  constraint invitations_scope_available check (scope_type in ('league', 'program')),
  constraint invitations_scope_program foreign key (league_id, scope_program_id)
    references public.programs (league_id, id),
  -- Only a hash of the link's token is stored: SHA-256, as 64 hex characters.
  constraint invitations_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint invitations_expires_after_created check (expires_at > created_at),
  constraint invitations_accepted_by_whom check ((accepted_at is null) = (accepted_by_account_id is null)),
  constraint invitations_accepted_or_cancelled check (accepted_at is null or cancelled_at is null),
  constraint invitations_version_positive check (version > 0)
);

create unique index invitations_token_hash_key on public.invitations (token_hash);
create index invitations_league_email on public.invitations (league_id, lower(email));

comment on table public.invitations is
  'An invitation to take a role in a league, sent to an email (T3 §5, P4 §4). Only the hash of its link token is kept.';

create table public.activity_log (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  actor_account_id uuid references public.accounts (id),
  action text not null,
  target_type text,
  target_id uuid,
  summary text not null,
  details jsonb not null default '{}',
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint activity_log_action_format check (
    length(action) <= 100 and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
  ),
  constraint activity_log_target_type_format check (
    target_type is null or target_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint activity_log_target_has_type check (target_id is null or target_type is not null),
  constraint activity_log_summary_length check (length(btrim(summary)) between 1 and 500),
  constraint activity_log_details_object check (jsonb_typeof(details) = 'object')
);

create index activity_log_league_at on public.activity_log (league_id, at desc, id desc);

comment on table public.activity_log is
  'Who changed what in a league, and when (A-6). History: rows are only ever added (T-45). actor_account_id is empty for changes the system made.';

create table public.support_access_log (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  staff_account_id uuid not null references public.accounts (id),
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_access_log_reason_length check (length(btrim(reason)) between 1 and 1000),
  -- T-77: a visit lasts at most one hour. ended_at is when it ends (or ended).
  constraint support_access_log_at_most_an_hour check (
    ended_at >= started_at and ended_at - started_at <= interval '1 hour'
  )
);

create index support_access_log_league on public.support_access_log (league_id, started_at desc);

comment on table public.support_access_log is
  'Our staff opening a league, with the reason (T-77); the league owner can see it. A visit lasts at most an hour and can only be ended early.';

create table public.command_receipts (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  command_id uuid not null,
  command text not null,
  account_id uuid references public.accounts (id),
  result jsonb not null,
  created_at timestamptz not null default now(),
  -- A receipt is found by league, account and command id together, so one account
  -- reusing another's command id gets its own answer, never the other's result.
  -- account_id is empty for commands the system ran; those share one key space.
  constraint command_receipts_once unique nulls not distinct (league_id, account_id, command_id),
  constraint command_receipts_command_format check (
    length(command) <= 100 and command ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
  )
);

comment on table public.command_receipts is
  'Commands already carried out, by the id the caller gave them, with their result, so a repeated command is answered without running twice (T3 §11). History: only ever added.';

-- History tables ----------------------------------------------------------------

create trigger activity_log_is_history before update or delete on public.activity_log
  for each row execute function public.refuse_history_change();
create trigger command_receipts_is_history before update or delete on public.command_receipts
  for each row execute function public.refuse_history_change();
create trigger support_access_log_is_history before delete on public.support_access_log
  for each row execute function public.refuse_history_change();

-- A visit starts when its row is written: the caller cannot date it earlier or
-- later, so the hour limit counts from the real start.
create or replace function public.start_support_access() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.started_at := now();
  return new;
end
$$;

create trigger support_access_log_starts_now before insert on public.support_access_log
  for each row execute function public.start_support_access();

create or replace function public.check_support_access_update() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if (to_jsonb(new) - 'ended_at' - 'updated_at') is distinct from
     (to_jsonb(old) - 'ended_at' - 'updated_at') then
    raise exception 'support_access_log is history: only ended_at can change'
      using errcode = 'restrict_violation';
  end if;
  if old.ended_at <= now() then
    raise exception 'this support visit is over; it can no longer change'
      using errcode = 'restrict_violation';
  end if;
  if new.ended_at > old.ended_at or new.ended_at < now() then
    raise exception 'a support visit can be ended now or earlier than planned, never extended or ended in the past'
      using errcode = 'restrict_violation';
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger support_access_log_end_early before update on public.support_access_log
  for each row execute function public.check_support_access_update();

-- T-220: purging a league from the bin (T-51) removes its history too. Only the
-- role that owns the tables can do it (EXECUTE is revoked from everyone else, and
-- refuse_history_change checks the owner as well), only for a league that has
-- been in the bin for 30 days, and the permission lasts only while this function
-- runs. Removing the league's other rows and the league itself is the purge job's
-- work (step 1.11 onwards).
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
  perform set_config('srleagues.history_purge', '', true);
end
$$;

revoke all on function public.purge_league_history(uuid) from public;

comment on function public.purge_league_history(uuid) is
  'Removes the history of a league that has been in the bin for 30 days (T-51, T-220). Table owner only.';

-- Editable tables ------------------------------------------------------------------

-- The arguments are the columns fixed once the row exists (see the top of this file).
create trigger role_grants_on_update before update on public.role_grants
  for each row execute function public.on_row_update('account_id', 'role', 'scope_type', 'scope_id');
create trigger invitations_on_update before update on public.invitations
  for each row execute function public.on_row_update('email', 'role', 'scope_type', 'scope_id');
