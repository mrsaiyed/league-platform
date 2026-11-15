-- S-7, T6 §8: a decided game's result changes only alongside a correction for it written
-- in the same transaction. Migration 0011 made the check ask for the transaction that
-- wrote the correction (written_in). A transaction id is unique only within one database
-- cluster: a copy restored from a dump into another one counts its transactions afresh,
-- so an old correction's written_in could match a later transaction there. The check now
-- also asks for the correction's time to be this transaction's start (at = now()), as
-- migration 0009's did. Both are set by the database (stamp_game_correction), never by
-- the caller, and a correction written in this transaction, in a savepoint or not,
-- always has both.

create or replace function public.check_game_result_corrected() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.game_corrections c
    where c.league_id = new.league_id and c.game_id = new.id
      and c.written_in = pg_current_xact_id()::text
      and c.at = now()
  ) then
    raise exception 'game % was decided: changing its result needs a correction with a reason', new.id
      using errcode = 'check_violation', constraint = 'games_result_change_needs_correction',
            hint = 'Write a game_corrections row for this game in the same transaction (S-7).';
  end if;
  return null;
end
$$;

comment on function public.check_game_result_corrected() is
  'Deferred AFTER UPDATE on games: a decided game''s result changed only alongside a correction for it written by the same transaction, at its time (S-7).';
