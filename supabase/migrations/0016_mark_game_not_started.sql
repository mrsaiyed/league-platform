-- 0016: a game marked not started takes the season's rules again (step 2.121, record
-- 061, T-264; S-40, S-1).
--
-- Migration 0009 fixes a game's rules (`format`) the first time it goes live or is
-- decided, and never lets them change again, "even if it later goes back to scheduled
-- or is postponed" (record 025). Marking a game not started (games.mark_not_started)
-- is not stepping back a game that was played to change its rules: the game was never
-- played, everything recorded in it is cleared (and kept in its events, behind a
-- `reset` marker), and who may do it is limited by S-40. So the game is as if it had
-- never started: its format is empty again and `format_fixed_at` is cleared, and it
-- takes the season's rules when it next starts.
--
-- The database allows that in one update only, and only for a game being marked not
-- started: the update that takes the game from live back to scheduled and empties its
-- format, while the game's latest event is the `reset` marker the command has just
-- written, and the game was never decided (no correction for it, no `end` or `reopen`
-- in its log: a game once final is reopened and corrected, never cleared, S-40). Both
-- together or neither: a live game sent back to scheduled that keeps its format keeps
-- `format_fixed_at` too, and every other change to a started game's rules is refused as
-- before (a postponed or cancelled game that had started, a decided game, the format
-- replaced rather than emptied, a game whose log does not end at a marker).
--
-- A game cleared that way has nothing recorded after its marker, so it may go to the bin
-- like any game never scored (`games_scored_not_binned`), unless it was ever decided.
-- Its events stay: the bin keeps the game's row, and the app never removes a game.
--
-- Functions only, each replaced or made whole; the triggers stay as 0009 and 0010 made
-- them. Safe to run again.

create or replace function public.game_ever_decided(league uuid, game uuid) returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.game_corrections c where c.league_id = league and c.game_id = game
  ) or exists (
    select 1 from public.game_events e
    where e.league_id = league and e.game_id = game and e.type in ('end', 'reopen')
  )
$$;

comment on function public.game_ever_decided(uuid, uuid) is
  'Whether a game was ever final or forfeited: a correction for it, or an end or reopen in its event log (S-40, record 061). Runs as the caller.';

create or replace function public.game_tracked_past_marker(league uuid, game uuid) returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.game_events e
    where e.league_id = league and e.game_id = game
      and e.seq > coalesce((
        select max(r.seq) from public.game_events r
        where r.league_id = league and r.game_id = game and r.type = 'reset'
      ), 0)
  )
$$;

comment on function public.game_tracked_past_marker(uuid, uuid) is
  'Whether the tracker has recorded anything for a game since it was last marked not started (its last reset event), or at all if it never was (record 061). Runs as the caller.';

create or replace function public.game_marked_not_started(league uuid, game uuid) returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select e.type = 'reset' from public.game_events e
    where e.league_id = league and e.game_id = game
    order by e.seq desc
    limit 1
  ), false)
  and not public.game_ever_decided(league, game)
$$;

comment on function public.game_marked_not_started(uuid, uuid) is
  'Whether a game''s latest event is the reset marker games.mark_not_started writes, and the game was never decided (S-40, record 061). Runs as the caller.';

-- The triggers on games run as the caller: the app's role reads its own league's events
-- and corrections through these (0005 grants no function to anyone by default).
grant execute on function public.game_ever_decided(uuid, uuid) to app_user;
grant execute on function public.game_tracked_past_marker(uuid, uuid) to app_user;
grant execute on function public.game_marked_not_started(uuid, uuid) to app_user;

create or replace function public.stamp_game_format_fixed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'live' and new.status = 'scheduled'
     and old.format is not null and new.format is null
     and public.game_marked_not_started(new.league_id, new.id) then
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
  'BEFORE INSERT OR UPDATE on games: format_fixed_at is the time the game first went live or was decided, set by the database. Cleared only by the update that marks a live game not started: back to scheduled with its format emptied, its log ending at the reset marker, never decided (S-40, record 061).';

create or replace function public.check_game_format_fixed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.status = 'live' and new.status = 'scheduled'
     and old.format is not null and new.format is null
     and public.game_marked_not_started(new.league_id, new.id) then
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

create or replace function public.check_game_bin_unscored() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if public.game_tracked_past_marker(new.league_id, new.id)
     or public.game_ever_decided(new.league_id, new.id) then
    raise exception 'game % has been scored, so it cannot go to the bin', new.id
      using errcode = 'restrict_violation', constraint = 'games_scored_not_binned',
            hint = 'Correct or reopen the game instead (S-7).';
  end if;
  return new;
end
$$;

comment on function public.check_game_bin_unscored() is
  'BEFORE UPDATE OF deleted_at on games: a game with game events is never put in the bin, unless everything in it was cleared by marking it not started and it was never decided (record 061).';
