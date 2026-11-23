-- 0024: an overturned result and a game awarded that was not played, each kept as a
-- pair of adjustments (step 2.56; S-10, S-85, T-307; the numbers audit's M6).
--
-- "Overturn a result" takes a win off the team that won a game and gives it to the team
-- that lost it; "Award a game not played" gives one team a win and the other a loss.
-- Each is one action under one reason, saved as one adjustment per team, so a record
-- always adds up. Two columns are added to public.standings_adjustments:
--
--   games_played: games played the adjustment adds to its team's row. 0 for every
--     adjustment but the two halves of a game awarded that was not played, which add 1
--     each (the calculation counts only games actually played, and a team awarded a
--     game would otherwise show more wins and losses than games).
--   paired_with: on the second half of a pair, the first half's id; empty otherwise.
--     Moving either half to the bin moves both (queries/bin-standings-adjustment.ts),
--     so the two halves never exist apart.
--
-- A column of public.standings_adjustments, so behind its league's fence already (0010).
-- Nothing is dropped.

alter table public.standings_adjustments
  add column games_played integer not null default 0;

alter table public.standings_adjustments add constraint standings_adjustments_games_played_range
  check (games_played between 0 and 1);

alter table public.standings_adjustments add column paired_with uuid;

-- The first half is of the same league and season.
alter table public.standings_adjustments add constraint standings_adjustments_pair
  foreign key (league_id, paired_with) references public.standings_adjustments (league_id, id);

alter table public.standings_adjustments add constraint standings_adjustments_not_own_pair
  check (paired_with is null or paired_with <> id);

create index standings_adjustments_paired_with on public.standings_adjustments (paired_with)
  where paired_with is not null;
