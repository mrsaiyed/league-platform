-- 0006: the jobs a change leaves for the worker (T7 §1, T-130, T-131, T-137,
-- decision record 012).
--
-- A command records its follow-up jobs here, through tx.jobs, in the same
-- transaction as the change that causes them (T-130): both are saved, or neither.
-- This table sits behind the league fence like every other league table, so a
-- transaction can record and see only its own league's jobs.
--
-- A job carries identifiers, never content (T-131), and the database refuses
-- anything else, so a name, an email address, a phone number or a message cannot
-- be stored here even by mistake:
-- - `type` is one of the job types of T7 §2. Core's list (jobTypes) is the same;
--   a test fails when they differ. A new type comes with a migration that replaces
--   jobs_type_known.
-- - `ids` is a flat object of at most ten ids under camelCase keys: a lower-case
--   UUID, or under a key ending in Date, Day or On (gameDay) a real YYYY-MM-DD date.
-- - `dedupe_key`, optional, is one to ten such ids joined by ':'. The same job is
--   recorded once per league, type and key however often its cause repeats.
-- - `last_error` is one of a fixed list of codes (core's jobErrorCodes), never an
--   error's message, which may carry personal content (T-86).
-- The content is built when the job runs.
--
-- The worker's side (record 012):
-- - public.take_jobs is the one way to look across leagues: it runs as the owner and
--   leases up to `how_many` due jobs to the caller, returning ids only. It refuses a
--   transaction that has a league or an account set, which every request's and
--   command's transaction has: only the worker's own take, with neither, may call
--   it. (A separate role for the worker is the later hardening, records 008, 012.)
--   A job is due when it is waiting and its run_after has passed, or when the
--   worker holding it let its lease run out (it stopped or crashed); then another
--   worker takes it, so a job may run more than once and every job must be safe to
--   run twice (T-137). Each take counts an attempt. A job whose lease ran out with
--   no attempts left goes to the failed list instead.
-- - Settling a job (done, handed over to pg-boss, retry later, failed) is an update
--   in a transaction for the job's own league, through the fence, and only by the
--   worker still holding its lease (lease_token).
--
-- States: waiting → running → done | failed, or back to waiting with a later
-- run_after (a retry); in production running → handed_over, after which pg-boss
-- holds it.

-- A real calendar date written YYYY-MM-DD (not 2026-02-30). Immutable: it reads
-- the digits itself, so no date setting changes its answer.
create or replace function public.is_iso_date(value text) returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  return to_char(
    make_date(substr(value, 1, 4)::integer, substr(value, 6, 2)::integer, substr(value, 9, 2)::integer),
    'YYYY-MM-DD'
  ) = value;
exception when others then
  -- make_date refuses a day that does not exist.
  return false;
end
$$;

comment on function public.is_iso_date(text) is
  'True for a real calendar date written YYYY-MM-DD.';

create or replace function public.is_job_id_value(value text) returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
$$;

comment on function public.is_job_id_value(text) is
  'True for a lower-case UUID: the id a job may carry (T-131).';

create or replace function public.is_job_ids(ids jsonb) returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  entry record;
begin
  if jsonb_typeof(ids) is distinct from 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_each(ids)) > 10 then
    return false;
  end if;
  for entry in select key, value from jsonb_each(ids) loop
    if entry.key !~ '^[a-z][A-Za-z0-9]{0,39}$' or jsonb_typeof(entry.value) <> 'string' then
      return false;
    end if;
    if entry.key ~ '(Date|Day|On)$' then
      if not public.is_iso_date(entry.value #>> '{}') then
        return false;
      end if;
    elsif not public.is_job_id_value(entry.value #>> '{}') then
      return false;
    end if;
  end loop;
  return true;
end
$$;

comment on function public.is_job_ids(jsonb) is
  'True for a flat object of at most ten ids under camelCase keys: lower-case UUIDs, or real YYYY-MM-DD dates under keys ending in Date, Day or On (T-131).';

create or replace function public.is_job_dedupe_key(dedupe_key text) returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  parts text[] := string_to_array(dedupe_key, ':');
  part text;
begin
  if dedupe_key is null or cardinality(parts) not between 1 and 10 then
    return false;
  end if;
  foreach part in array parts loop
    if not (public.is_job_id_value(part) or public.is_iso_date(part)) then
      return false;
    end if;
  end loop;
  return true;
end
$$;

comment on function public.is_job_dedupe_key(text) is
  'True for one to ten lower-case UUIDs or real YYYY-MM-DD dates joined by colons: a dedupe key made of ids only (T-131).';

create table public.jobs (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  type text not null,
  ids jsonb not null default '{}',
  dedupe_key text,
  state text not null default 'waiting',
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  finished_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The job types of T7 §2 (core's jobTypes).
  constraint jobs_type_known check (type in (
    'announcements.send', 'bin.empty', 'cache.clear', 'chat.deliver', 'email.send',
    'email.status', 'exports.build', 'games.unfinished', 'imports.run', 'notify.event',
    'recaps.plan', 'recaps.send', 'reminders.plan', 'reminders.send', 'schedule.generate',
    'sessions.tidy', 'standings.rebuild', 'waitlist.expire'
  )),
  constraint jobs_ids_only check (public.is_job_ids(ids)),
  constraint jobs_dedupe_key_ids_only check (
    dedupe_key is null or public.is_job_dedupe_key(dedupe_key)
  ),
  constraint jobs_state check (state in ('waiting', 'running', 'done', 'failed', 'handed_over')),
  constraint jobs_attempts check (attempts >= 0 and attempts <= max_attempts),
  constraint jobs_max_attempts check (max_attempts between 1 and 20),
  -- A lease exactly while running: who holds the job, and until when.
  constraint jobs_lease_while_running check (
    (state = 'running') = (lease_token is not null)
    and (lease_token is null) = (lease_expires_at is null)
  ),
  constraint jobs_finished_when_settled check (
    (state in ('done', 'failed', 'handed_over')) = (finished_at is not null)
  ),
  -- A fixed code (core's jobErrorCodes), never an error's message (T-86).
  constraint jobs_last_error_known check (last_error in (
    'bad_job_data', 'lease_expired', 'no_handler', 'not-authorized', 'rate-limited',
    'rejected', 'unavailable', 'unexpected', 'unexpected-answer'
  )),
  constraint jobs_version_positive check (version > 0)
);

create unique index jobs_dedupe_key_once
  on public.jobs (league_id, type, dedupe_key) where dedupe_key is not null;
-- take_jobs looks at both states that can be due, oldest first.
create index jobs_takeable on public.jobs (run_after) where state in ('waiting', 'running');
create index jobs_running_lease on public.jobs (lease_expires_at) where state = 'running';
create index jobs_league_state on public.jobs (league_id, state);

comment on table public.jobs is
  'A job a change left for the worker, recorded in the same transaction (T-130), carrying ids only (T-131). Record 012.';

-- What a job is and is for is fixed once recorded; only its progress changes.
create trigger jobs_on_update before update on public.jobs
  for each row execute function public.on_row_update('type', 'ids', 'dedupe_key', 'max_attempts');

-- The worker's one look across leagues (record 012, T-221's pattern): run as the
-- owner, which sees every league, it leases due jobs to the caller and returns
-- their ids. Nothing else of any row is returned. Only a transaction with no league
-- and no account set may call it: the worker's own.
create or replace function public.take_jobs(how_many integer, lease_seconds integer)
returns table (
  job_id uuid,
  job_league_id uuid,
  job_type text,
  job_ids jsonb,
  job_attempt integer,
  job_max_attempts integer,
  job_lease_token uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.require_view_of_every_league();
  if public.current_league_id() is not null or public.current_account_id() is not null then
    raise exception 'take_jobs is for the worker: a transaction with a league or an account set may not take jobs'
      using errcode = 'insufficient_privilege';
  end if;
  if how_many is null or how_many not between 1 and 50 then
    raise exception 'take_jobs: how_many must be 1 to 50'
      using errcode = 'invalid_parameter_value';
  end if;
  if lease_seconds is null or lease_seconds not between 10 and 3600 then
    raise exception 'take_jobs: lease_seconds must be 10 to 3600'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A worker that held a job until its lease ran out, on the last attempt allowed:
  -- the job goes to the failed list rather than running again.
  update public.jobs j
  set state = 'failed', lease_token = null, lease_expires_at = null,
      last_error = 'lease_expired', finished_at = now()
  where j.state = 'running' and j.lease_expires_at <= now() and j.attempts >= j.max_attempts;

  return query
  with due as (
    select j.id
    from public.jobs j
    where j.state in ('waiting', 'running')
      and ((j.state = 'waiting' and j.run_after <= now())
        or (j.state = 'running' and j.lease_expires_at <= now()))
      and j.attempts < j.max_attempts
    order by j.run_after, j.id
    limit how_many
    for update skip locked
  )
  update public.jobs j
  set state = 'running',
      attempts = j.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => lease_seconds)
  from due
  where j.id = due.id
  returning j.id, j.league_id, j.type, j.ids, j.attempts, j.max_attempts, j.lease_token;
end
$$;

comment on function public.take_jobs(integer, integer) is
  'Leases up to how_many due jobs, from every league, to the calling worker and returns their ids (record 012). Owner-run; the only look across leagues at jobs; refuses a transaction with a league or account set.';

-- What app_user may do. A command records jobs (insert of what a job is, nothing of
-- its progress); the worker settles the jobs it holds (update of their progress
-- only), each in a transaction for its league. No DELETE: clearing old jobs is the
-- nightly housekeeping's, as the owner (later).
grant select on public.jobs to app_user;
grant insert (league_id, type, ids, dedupe_key, run_after) on public.jobs to app_user;
grant update (state, run_after, lease_token, lease_expires_at, last_error, finished_at)
  on public.jobs to app_user;
grant execute on function public.is_iso_date(text) to app_user;
grant execute on function public.is_job_id_value(text) to app_user;
grant execute on function public.is_job_ids(jsonb) to app_user;
grant execute on function public.is_job_dedupe_key(text) to app_user;
grant execute on function public.take_jobs(integer, integer) to app_user;

alter table public.jobs enable row level security;
alter table public.jobs force row level security;

create policy jobs_league_fence on public.jobs
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

select migration_log.revoke_hosted_api_roles();
