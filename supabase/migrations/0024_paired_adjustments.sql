-- 0024: an overturned result and a game awarded that was not played, each kept as a
-- pair of adjustments (step 2.56; S-10, S-85, T-307; the numbers audit's M6).
--
-- "Overturn a result" takes a win off the team that won a game and gives it to the team
-- that lost it; "Award a game not played" gives one team a win and the other a loss.
-- Each is one action under one reason, saved as one adjustment per team, so a record
-- always adds up. Three columns are added to public.standings_adjustments:
--
--   games_played: games played the adjustment adds to its team's row. 0 for every
--     adjustment but the two halves of a game awarded that was not played, which add 1
--     each (the calculation counts only games actually played, and a team awarded a
--     game would otherwise show more wins and losses than games).
--   paired_with: on the second half of a pair, the first half's id; empty otherwise.
--     No two rows name the same first half (a unique index where it is set).
--     Moving either half to the bin moves both (queries/bin-standings-adjustment.ts),
--     so the two halves never exist apart. The first half is of the same league and
--     season (a foreign key on all three).
--   game_id: on both halves of an overturned result, the game overturned; empty for a
--     free adjustment and for a game awarded. A game has one overturn at a time
--     (commands/overturn-result.ts), and while it has one its result is not reopened,
--     corrected or moved to the bin (S-85).
--
-- None of the three changes once written: the update trigger of 0010 lists the columns it
-- fixes in its arguments, so it is made again, with the same name and function, the new
-- columns added to the list.
--
-- Columns of public.standings_adjustments, so behind its league's fence already (0010).
-- Nothing is dropped but that trigger, which is put back in the same file (T-183).

alter table public.standings_adjustments
  add column games_played integer not null default 0;

alter table public.standings_adjustments add constraint standings_adjustments_games_played_range
  check (games_played between 0 and 1);

alter table public.standings_adjustments add column paired_with uuid;

alter table public.standings_adjustments add constraint standings_adjustments_league_season_id_key
  unique (league_id, season_id, id);

-- The first half is of the same league and season.
alter table public.standings_adjustments add constraint standings_adjustments_pair
  foreign key (league_id, season_id, paired_with)
  references public.standings_adjustments (league_id, season_id, id);

alter table public.standings_adjustments add constraint standings_adjustments_not_own_pair
  check (paired_with is null or paired_with <> id);

-- A half is paired at most once: two rows never point at the same first half.
create unique index standings_adjustments_paired_with
  on public.standings_adjustments (paired_with)
  where paired_with is not null;

alter table public.standings_adjustments add column game_id uuid;

-- The game overturned is of the same league; an award names no game.
alter table public.standings_adjustments add constraint standings_adjustments_game
  foreign key (league_id, game_id) references public.games (league_id, id);

alter table public.standings_adjustments add constraint standings_adjustments_game_not_awarded
  check (game_id is null or games_played = 0);

create index standings_adjustments_game on public.standings_adjustments (game_id)
  where game_id is not null;

-- 0010's update trigger, with the three new columns among those fixed once written.
drop trigger if exists standings_adjustments_on_update on public.standings_adjustments;

create trigger standings_adjustments_on_update before update on public.standings_adjustments
  for each row execute function public.on_row_update(
    'season_id', 'team_id', 'account_id', 'paired_with', 'games_played', 'game_id'
  );
