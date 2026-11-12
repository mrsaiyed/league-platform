-- 0002: the conventions every table follows (T3 §1, T-40 to T-47).
--
-- Three helpers that the tables in 0003 and 0004 use:
--
-- - public.uuid_v7(): the default for every `id` (T-41). Version 7 UUIDs start
--   with the creation time, so they sort in the order rows were made. PostgreSQL
--   18 has uuidv7() built in, but the hosted database may run an older version,
--   so we keep our own and use it everywhere.
-- - public.on_row_update(): the trigger on every editable table. It refuses to
--   change `id`, `created_at` or `league_id` (a row never moves to another league,
--   T-40), or any further column the trigger names as an argument, stamps
--   `updated_at`, and adds one to `version` where the table has it (T-46). The
--   caller cannot set `version` itself: a save states the version it started from
--   in its WHERE clause, and the database moves it on.
-- - public.refuse_history_change(): the trigger on history tables, which are only
--   ever added to (T-45). It refuses every UPDATE and DELETE, except the removal of
--   a purged league's history (T-220, decision record 007).
--
-- Times are `timestamptz`, which PostgreSQL stores in UTC (T-42).

-- A version 7 UUID (RFC 9562): 48 bits of Unix time in milliseconds, the version
-- (7), 12 bits of sub-millisecond time (method 3 of the RFC, so ids made one after
-- another on one connection keep their order), the variant, then random bits.
create or replace function public.uuid_v7() returns uuid
language plpgsql
volatile
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  stamp numeric := extract(epoch from clock_timestamp()) * 1000;
  millis bigint := floor(stamp)::bigint;
  fraction integer := floor((stamp - floor(stamp)) * 4096)::integer;
  bytes bytea := uuid_send(gen_random_uuid());
begin
  bytes := overlay(bytes placing substring(int8send(millis) from 3) from 1 for 6);
  -- Byte 6: version 7 in the high four bits, then the top of the fraction.
  bytes := set_byte(bytes, 6, 112 | (fraction >> 8));
  bytes := set_byte(bytes, 7, fraction & 255);
  -- Byte 8 keeps the variant bits (10) that gen_random_uuid() already set.
  return encode(bytes, 'hex')::uuid;
end
$$;

comment on function public.uuid_v7() is
  'A version 7 UUID: creation time first, so ids sort in creation order (T-41). The default for every id.';

create or replace function public.on_row_update() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  key text;
  changes jsonb := jsonb_build_object('updated_at', now());
begin
  -- Trigger arguments name the table's own fixed columns (role_grants.role, say).
  foreach key in array array['id', 'created_at', 'league_id'] || tg_argv loop
    if new_row -> key is distinct from old_row -> key then
      raise exception '%.% cannot be changed', tg_table_name, key
        using errcode = 'restrict_violation',
              hint = 'This column is fixed once the row exists. Make a new row instead.';
    end if;
  end loop;
  if old_row ? 'version' then
    changes := changes || jsonb_build_object('version', (old_row ->> 'version')::integer + 1);
  end if;
  new := jsonb_populate_record(new, changes);
  return new;
end
$$;

comment on function public.on_row_update() is
  'BEFORE UPDATE on every editable table: id, created_at, league_id and the columns named as trigger arguments are fixed; stamps updated_at; adds one to version (T-46).';

-- The one way history is removed (T-220): public.purge_league_history (0004) sets
-- srleagues.history_purge to the purged league's id for its own transaction. The
-- setting counts only for that league's rows, and only when the role removing them
-- owns the table (the role that runs migrations). The app's role never owns a table
-- (step 1.7), so setting it from the app changes nothing.
create or replace function public.refuse_history_change() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE'
     and to_jsonb(old) ->> 'league_id' = current_setting('srleagues.history_purge', true)
     and pg_has_role(
       current_user,
       (select c.relowner from pg_class c where c.oid = tg_relid),
       'MEMBER'
     ) then
    return old;
  end if;
  raise exception '% is history: rows are only ever added, never changed or removed (%)',
    tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
end
$$;

comment on function public.refuse_history_change() is
  'BEFORE UPDATE OR DELETE on history tables (T-45): refuses the change, except a purge of a binned league''s history by the table owner (T-220).';

-- A JSON document column (T-44, T-50) holds an object that names its own format
-- version, so code can upgrade old documents when it reads them.
create or replace function public.is_versioned_document(document jsonb) returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  -- coalesce: a missing key gives NULL, and a CHECK that is NULL would pass.
  select coalesce(
    jsonb_typeof(document) = 'object'
      and jsonb_typeof(document -> 'version') = 'number'
      and (document ->> 'version') ~ '^[1-9][0-9]*$',
    false
  )
$$;

comment on function public.is_versioned_document(jsonb) is
  'True for a JSON object with a whole-number "version" of 1 or more (T-50). Used in CHECK constraints.';
