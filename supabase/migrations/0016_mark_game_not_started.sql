-- 0016: a game marked not started takes the season's rules again (step 2.121, record
-- 061, T-264; S-40, S-1).
--
-- Migration 0009 fixes a game's rules (`format`) the first time it goes live or is
-- decided, and never lets them change again, "even if it later goes back to scheduled
-- or is postponed" (record 025). Marking a game not started (games.mark_not_started)
-- is not stepping back a game that was played to change its rules: the game was never
-- played, everything recorded in it is cleared (and kept in its events), and who may do
-- it is limited by S-40. So the game is as if it had never started: its format is empty
-- again and `format_fixed_at` is cleared, and it takes the season's rules when it next
-- starts.
--
-- That is allowed in one update only: the one that takes a game from live back to
-- scheduled and, in the same update, empties its format. Both together or neither: a
-- live game sent back to scheduled that keeps its format keeps `format_fixed_at` too,
-- and any other change to a started game's format is refused as before (a postponed or
-- cancelled game that had started, a decided game, a game back to scheduled by any
-- other update). Only the two functions change; their triggers stay as 0009 made them.
-- Safe to run again: each function is replaced whole.

create or replace function public.stamp_game_format_fixed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'live' and new.status = 'scheduled'
     and old.format is not null and new.format is null then
    -- Marked not started: as if it had never started.
    new.format_fixed_at := null;
  elsif tg_op = 'UPDATE' and old.format_fixed_at is not null then
    new.format_fixed_at := old.format_fixed_at;
  elsif new.status in ('live', 'final', 'forfeit') then
    new.format_fixed_at := now();
  else
    new.format_fixed_at := null;
  end if;
  return new;
end
$$;

comment on function public.stamp_game_format_fixed() is
  'BEFORE INSERT OR UPDATE on games: format_fixed_at is the time the game first went live or was decided, set by the database. Cleared only by the update that marks a live game not started: back to scheduled with its format emptied in the same update (S-40, record 061).';

create or replace function public.check_game_format_fixed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.status = 'live' and new.status = 'scheduled'
     and old.format is not null and new.format is null then
    -- Marked not started (S-40): its rules go with everything recorded in it.
    return new;
  end if;
  if (old.format_fixed_at is not null or old.status in ('live', 'final', 'forfeit'))
     and new.format is distinct from old.format then
    raise exception 'game % has started, so the rules it is played under cannot change', new.id
      using errcode = 'restrict_violation', constraint = 'games_format_fixed_once_started';
  end if;
  return new;
end
$$;

comment on function public.check_game_format_fixed() is
  'BEFORE UPDATE OF format on games: refuses a change to the rules of a game that has ever gone live or been decided (S-1, S-21), except emptying them in the update that marks a live game not started (S-40, record 061).';
