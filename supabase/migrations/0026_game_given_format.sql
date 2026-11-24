-- 0026: the format a game is GIVEN, kept apart from the rules FIXED at its start (step
-- 2.119; P7 §5.1, S-21, S-35; T-340).
--
-- `games.format` (0009) holds the rules a game is played under, fixed the moment it goes
-- live; marking a game not started (0016) empties it, so the game takes its season's
-- rules again when it next starts. A game can now be given its own format before it is
-- under way: by an admin from the games area, or at the scorer's table before the first
-- play where the league allows it. That format is `given_format`: a versioned document
-- of the format part of a season's rules (periods and lengths, overtime, the clock, the
-- fouls and the timeouts). When the game starts, the rules fixed are the season's with
-- the given format in place; marking it not started empties `format` and leaves
-- `given_format` as it is, so the game returns to what it was given.
--
-- The given format changes only while the game has never started: the trigger below
-- refuses a change once its rules are fixed or it is live or decided, as 0009 does for
-- `format`. Nothing is moved or dropped; every game starts with none.

alter table public.games add column given_format jsonb;

alter table public.games add constraint games_given_format_document check (
  given_format is null
  or (public.is_versioned_document(given_format) and octet_length(given_format::text) <= 16384)
);

comment on column public.games.given_format is
  'The format this game was given before it started (step 2.119), null for its season''s; kept when the game is marked not started.';

create or replace function public.check_game_given_format() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if (old.format_fixed_at is not null or old.status in ('live', 'final', 'forfeit'))
     and new.given_format is distinct from old.given_format then
    raise exception 'game % has started, so the format it was given cannot change', new.id
      using errcode = 'restrict_violation', constraint = 'games_given_format_fixed_once_started';
  end if;
  return new;
end
$$;

comment on function public.check_game_given_format() is
  'BEFORE UPDATE OF given_format on games: refuses a change to the format a game was given once it has gone live or been decided (step 2.119).';

create trigger games_given_format_fixed_once_started
  before update of given_format on public.games
  for each row execute function public.check_game_given_format();
