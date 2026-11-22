-- 0021: how many overtime periods a final game had, kept with its result (step 2.200;
-- P7 §5.6 "Overtime: added periods; shown on the result"; the numbers audit's M8).
--
-- Until now only a game's play-by-play said it went to overtime ("OT1"): its board, its
-- card on the schedule, the home page and a team's page read a game row that carried no
-- periods. The engine knows them (packages/sports: the period a game ended in, less the
-- format's regulation periods), so the game that the tracker ends writes them here, in
-- the same update that makes it final:
--
--   overtime_periods: 0 for a game the tracker ended in regulation, 1 for one ended in
--     the first overtime, 2 in the second, and so on (the engine's last period is 20
--     and a game has 2 or 4 regulation periods, so at most 18). Empty when it is not
--     known: a final score typed in, a box score from paper or a fixture import (none of
--     them says yet whether the game went to overtime: step 2.56), a forfeit, and every
--     game that is not final. Every change of a game's result writes it again (the app's
--     one update of a result, update-game-result.ts), so a game reopened loses it and a
--     game ended again gets the count of that end.
--
-- Games that were final before this migration keep it empty: nothing here guesses how
-- many periods they had from their saved states. The pages show no mark for an empty
-- count, as for 0.
--
-- The count is part of the result: a decided game's count changes only with a
-- correction for it in the same transaction (S-7), as its status and scores do. The
-- constraint trigger of 0009 lists the columns it guards in its WHEN, so it is made
-- again, with the same name and function, the new column added to the list.
--
-- A column of public.games, so behind its league's fence already (0005). Nothing is
-- dropped but that trigger, which is put back in the same file (T-183).

alter table public.games add column overtime_periods integer;

alter table public.games add constraint games_overtime_periods_range check (
  overtime_periods is null or overtime_periods between 0 and 18
);

-- Only a final game has a count: a forfeit was not played, and a game still to play or
-- being played has not ended.
alter table public.games add constraint games_overtime_when_final check (
  overtime_periods is null or status = 'final'
);

comment on column public.games.overtime_periods is
  'How many overtime periods a final game had (P7 §5.6): 0 in regulation, as the tracker ended it. Empty when not known: typed in, a box score, a forfeit, any game not final, and games final before 0021.';

-- S-7, as 0009 made it, with the overtime count among the columns of a decided game's
-- result.
drop trigger if exists games_result_change_needs_correction on public.games;

create constraint trigger games_result_change_needs_correction
  after update on public.games
  deferrable initially deferred
  for each row
  when (
    old.status in ('final', 'forfeit')
    and (
      new.status is distinct from old.status
      or new.home_score is distinct from old.home_score
      or new.away_score is distinct from old.away_score
      or new.overtime_periods is distinct from old.overtime_periods
      or new.home_team_id is distinct from old.home_team_id
      or new.away_team_id is distinct from old.away_team_id
      or new.division_id is distinct from old.division_id
      or new.stage_id is distinct from old.stage_id
      or new.finalized_at is distinct from old.finalized_at
      -- Into the bin or back out of it.
      or (old.deleted_at is null) <> (new.deleted_at is null)
    )
  )
  execute function public.check_game_result_corrected();
