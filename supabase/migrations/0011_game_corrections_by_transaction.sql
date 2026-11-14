-- S-7, T6 §8: a decided game's result changes only alongside a correction for it written
-- in the same transaction. Migration 0009 told that correction apart from older ones by
-- its time (at = now(), the transaction's start). Two transactions can start in the same
-- instant, PGlite's clock in particular ticks no finer than a millisecond, so a correction
-- written by an earlier transaction could pass for one written by this transaction. Now
-- each correction also records the transaction that wrote it, and the check asks for that.
-- Corrections written before this migration have none: they are all older than any
-- transaction to come, which is what the check needs.

alter table public.game_corrections add column written_in text;

comment on column public.game_corrections.written_in is
  'The transaction that wrote the correction (pg_current_xact_id), set by the database: how the S-7 check finds the correction made alongside a change.';

create or replace function public.stamp_game_correction() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.at := now();
  -- The top-level transaction, also inside a savepoint.
  new.written_in := pg_current_xact_id()::text;
  return new;
end
$$;

comment on function public.stamp_game_correction() is
  'BEFORE INSERT on game_corrections: the correction is dated, and its transaction recorded, by the database, never by the caller.';

create or replace function public.check_game_result_corrected() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.game_corrections c
    where c.league_id = new.league_id and c.game_id = new.id
      and c.written_in = pg_current_xact_id()::text
  ) then
    raise exception 'game % was decided: changing its result needs a correction with a reason', new.id
      using errcode = 'check_violation', constraint = 'games_result_change_needs_correction',
            hint = 'Write a game_corrections row for this game in the same transaction (S-7).';
  end if;
  return null;
end
$$;

comment on function public.check_game_result_corrected() is
  'Deferred AFTER UPDATE on games: a decided game''s result changed only alongside a correction for it written by the same transaction (S-7).';
