-- 0015: players added at the scorer's table (step 2.117 review; record 058, T-261;
-- S-44, S-45).
--
-- S-44: a player added at the table is never refused because their number is already
-- worn. They are taken, marked for review (S-6), and the season's unique-numbers rule
-- (0008) is applied when an admin confirms them, that is when `needs_review` is
-- cleared, and on the league's own roster screens. So the rule leaves out an entry
-- still waiting for review, in both directions: such an entry is not checked when it
-- is written, and no other entry is refused because such an entry wears the number.
-- Clearing the mark checks it, so an admin confirms a player only once the clash is
-- put right. Switching the rule on for a season leaves such entries out too.
--
-- S-45: a scorekeeper may rename a player added at the table, while they wait for
-- review. The name they had before is kept on the person, so an admin can see it and
-- put it back; it is a personal field like the name, emptied with it if the person is
-- erased. It never goes into the activity log or the game's events (T-220, T-52).
--
-- Safe to run twice: columns are added only if missing, functions and triggers are
-- replaced. Nothing is dropped or renamed.

alter table public.people
  add column if not exists previous_first_name text
    constraint people_previous_first_name_length check (
      previous_first_name is null
      or previous_first_name = ''
      or length(btrim(previous_first_name)) between 1 and 100
    ),
  add column if not exists previous_last_name text
    constraint people_previous_last_name_length check (
      previous_last_name is null
      or previous_last_name = ''
      or length(btrim(previous_last_name)) between 1 and 100
    );

comment on column public.people.previous_first_name is
  'For a player renamed at the scorer''s table (S-45): the first name they had before, for an admin to see and restore. Null for everyone else; emptied with the name on erasure.';
comment on column public.people.previous_last_name is
  'For a player renamed at the scorer''s table (S-45): the last name they had before. Null for everyone else.';

-- The roster's unique-number check (0008), leaving out entries waiting for review.
create or replace function public.check_roster_jersey() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  team_season uuid;
begin
  -- No number, no longer on the team, or added at the table and not yet reviewed
  -- (S-44): nothing to check yet.
  if new.jersey_number is null or new.left_on is not null or new.needs_review then
    return new;
  end if;
  select t.season_id into team_season
  from public.teams t where t.league_id = new.league_id and t.id = new.team_id;
  -- No such team: roster_entries_team answers that.
  if team_season is null then
    return new;
  end if;
  if current_setting('transaction_isolation') in ('repeatable read', 'serializable') then
    raise exception 'a jersey number can only be set in a read committed transaction'
      using errcode = 'invalid_transaction_state', constraint = 'roster_entries_jersey_isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('roster_jerseys:' || team_season::text, 0));
  if exists (
    select 1 from public.seasons s where s.id = team_season and s.unique_jerseys
  ) and exists (
    select 1 from public.roster_entries r
    where r.league_id = new.league_id
      and r.team_id = new.team_id
      and r.jersey_number = new.jersey_number
      and r.left_on is null
      and not r.needs_review
      and r.id <> new.id
  ) then
    raise exception 'jersey number % is already worn on this team', new.jersey_number
      using errcode = 'unique_violation', constraint = 'roster_entries_unique_jersey',
            hint = 'This season asks for unique jersey numbers in a team.';
  end if;
  return new;
end
$$;

comment on function public.check_roster_jersey() is
  'BEFORE INSERT OR UPDATE on roster_entries: while the season asks for unique jerseys, refuses a number already worn by someone on the team. An entry waiting for review (S-44) is checked when the mark is cleared, and is not counted until then.';

-- Clearing the review mark checks the number (S-44).
create or replace trigger roster_entries_unique_jersey
  before insert or update of jersey_number, left_on, team_id, needs_review on public.roster_entries
  for each row execute function public.check_roster_jersey();

-- Switching the rule on for a season (0008), leaving out entries waiting for review.
create or replace function public.check_season_unique_jerseys() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_setting('transaction_isolation') in ('repeatable read', 'serializable') then
    raise exception 'the unique-jersey rule can only be switched on in a read committed transaction'
      using errcode = 'invalid_transaction_state', constraint = 'roster_entries_jersey_isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('roster_jerseys:' || new.id::text, 0));
  if exists (
    select 1
    from public.roster_entries r
    join public.teams t on t.league_id = r.league_id and t.id = r.team_id
    where t.league_id = new.league_id
      and t.season_id = new.id
      and r.jersey_number is not null
      and r.left_on is null
      and not r.needs_review
    group by r.team_id, r.jersey_number
    having count(*) > 1
  ) then
    raise exception 'a team in this season already has two people wearing one number'
      using errcode = 'unique_violation', constraint = 'seasons_unique_jerseys_clash',
            hint = 'Change one of the numbers first, then switch the rule on.';
  end if;
  return null;
end
$$;

comment on function public.check_season_unique_jerseys() is
  'AFTER UPDATE on seasons, when the unique-jersey rule is switched on: refuses while a team of the season already has a number worn twice, leaving out entries waiting for review (S-44).';
