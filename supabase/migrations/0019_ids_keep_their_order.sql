-- 0019: ids made one after another on one connection keep their order, on every
-- database (step 2.151, record 068, T-272; T3 §1, T-41).
--
-- WHAT IS PROMISED, exactly: every id public.uuid_v7() hands out sorts after every id
-- it handed out before on the same connection (the same database session), as long as
-- the transaction that made the earlier one was not rolled back. Nothing is promised
-- across connections: two connections writing at the same time each keep their own
-- order, and between them the ids follow the clock only roughly (two servers' clocks,
-- or two ids in the same instant, can sort either way). Ids made outside the database
-- are outside this promise too: the made-up stand-in's (apps/web, which keeps its own
-- order in the same way) and the ids a tablet makes for its taps (record 058).
--
-- Why it changes: 0002 made the time part from the clock alone, milliseconds then 12
-- bits of finer time (RFC 9562, method 3), and said that kept ids in order on one
-- connection. That holds only where the clock is finer than the time between two ids.
-- The hosted database's clock has microseconds; PGlite's (local work, the seed, the
-- transfer's target, every test) moves in whole milliseconds, so the finer bits were
-- always 0 and of two ids made in the same millisecond either could sort first (2,430
-- of 5,000 ids made in one statement sorted below the one before; 50 of 2,000 pairs of
-- inserts reversed). Gate tests failed by chance on it (step 2.149).
--
-- The new form keeps the same layout: 48 bits of Unix time in milliseconds, the version
-- (7), 12 bits of finer time, the variant (10), then 62 random bits. It remembers, in a
-- setting of the session (srleagues.uuid_v7_last: the 60-bit time part, as text), the
-- last time part it gave. When the clock reads the same or earlier (the same
-- millisecond on PGlite, the same instant on a fast server, the clock stepped back),
-- it uses the last time part plus one: a count within the millisecond, as the RFC's
-- method 1 allows, that carries into the next millisecond after 4,096 ids. The time part
-- is still the time (the clock's, or a few counts after the last), never earlier than
-- the clock, and ahead of it only while more than 4,096 ids a millisecond are made.
--
-- Why a session setting: it is the one piece of memory PostgreSQL keeps per
-- connection that both PGlite (PostgreSQL itself, built for the browser) and the hosted
-- PostgreSQL have, that any role may write (a name with a dot is a setting anyone may
-- set, as srleagues.history_purge is), and that needs no table, no lock and no write to
-- disk. A sequence or a table would be shared by every connection (a lock on every
-- insert, and still no order across connections); a temporary table would have to be
-- made on every connection first. PostgreSQL 18's own uuidv7() keeps this order too,
-- but the hosted database may run an older version, so one form serves both.
--
-- What it leaves behind, and when that matters:
-- - A transaction that rolls back takes its change to the setting with it, so the next
--   id may repeat a time part a rolled-back id had. Harmless: those rows do not exist,
--   the random bits keep every id unique, and the next id still sorts after every id of
--   this connection that does exist.
-- - A connection pool that hands one connection to many requests: the memory is the
--   connection's, so ids stay in order across those requests; nothing more is promised.
--   A pool that resets its connections (RESET ALL, DISCARD ALL) clears the memory; ids
--   then follow the clock alone until the next one is made.
-- - Volatile and now PARALLEL UNSAFE (it writes a setting, which a parallel worker may
--   not): a query that calls it runs without parallel workers. As a column default it
--   is called once a row, in the order the rows are inserted, so a multi-row insert
--   gets increasing ids in row order.
-- - It costs a little more per id: the measurement is in record 068.
--
-- The comment on 0002 cannot be corrected in its own file: a migration's text is fixed
-- once it has run (its checksum is checked). This file and the function's own comment
-- say what is promised; T3 says the same.
--
-- Safe to run twice: the function is replaced in place with `create or replace`, as 0002
-- made it, with the same name, arguments and result, so every column default that
-- names it stays as it is. Nothing is dropped or renamed (T-183). The grant to app_user
-- (0005) stays with the function.

create or replace function public.uuid_v7() returns uuid
language plpgsql
volatile
parallel unsafe
set search_path = pg_catalog, pg_temp
as $$
declare
  -- The time part: milliseconds times 4,096, plus the fraction of the millisecond in
  -- 4,096ths. extract() gives an exact numeric, so nothing is lost before the floor.
  stamp bigint := floor(extract(epoch from clock_timestamp()) * 4096000)::bigint;
  -- The last time part this connection gave; none yet is 0.
  last bigint := coalesce(nullif(current_setting('srleagues.uuid_v7_last', true), '')::bigint, 0);
begin
  if stamp <= last then
    stamp := last + 1;
  end if;
  -- false: for the session, not only this transaction.
  perform set_config('srleagues.uuid_v7_last', stamp::text, false);
  -- Bytes 0-5: the milliseconds. Bytes 6-15: random, then byte 6 is the version (7) and
  -- the top four bits of the fraction, byte 7 the rest of it; byte 8 keeps the variant
  -- bits (10) that gen_random_uuid() already set.
  return encode(
    substring(int8send(stamp >> 12) from 3)
      || set_byte(
        set_byte(substring(uuid_send(gen_random_uuid()) from 7), 0, 112 | ((stamp >> 8) & 15)::integer),
        1,
        (stamp & 255)::integer
      ),
    'hex'
  )::uuid;
end
$$;

comment on function public.uuid_v7() is
  'A version 7 UUID, the default for every id (T-41). On one connection each id sorts after every id it made before (the time, or the last time part plus one); nothing is promised across connections (record 068).';
