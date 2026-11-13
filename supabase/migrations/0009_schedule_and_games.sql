-- 0009: the schedule and games (T3 §8): rounds, stages, games, schedule drafts and
-- revisions, scorekeeper assignments and game corrections. Decision record 025
-- (T-237) explains the choices T3 left open.
--
-- Every table follows 0002 and 0005: a version 7 UUID id, created_at, a league_id
-- that every link includes (T-40), and its one forced row-level security policy
-- keyed to the league (T-61). Editable tables have updated_at and a version moved
-- by on_row_update (T-46). Games go to the bin (`deleted_at`, T-45). Schedule
-- revisions and game corrections are history: only ever added, never changed or
-- removed (T-45, S-7), except by the league purge (T-220).
--
-- Rules the database enforces here (T-47):
-- - a round, stage, schedule draft and schedule revision belong to a season of
--   their league; a game's division, round and stage are of the game's own season;
-- - a game's two teams are different and both of its season (T3 §12); its venue
--   is the league's and its court is at that venue;
-- - a scheduled, postponed or cancelled game has no score; a final or forfeited
--   game has both scores and the time it was finalized (T3 §12); a live game has
--   both scores or neither; the winner is worked out from the scores, never typed;
--   a forfeit has a winner;
-- - a game's rules (`format`) never change once it has gone live or been decided
--   (S-1, S-21);
-- - changing a decided game's result (its status, a score, a team, its division or
--   stage, the time it was finalized, or putting it in or taking it out of the bin)
--   needs a correction row for that game in the same transaction (S-7);
-- - one regular-season stage per season, one schedule draft per season, round
--   numbers and game numbers unique in their season, schedule revisions numbered
--   1, 2, 3 ... in their season;
-- - a scorekeeper is assigned to a game once.

-- Rounds (T3 §8) ------------------------------------------------------------------

-- A week or round of a season ("Week 5 — Rivalry Week"). Not binned: a round with
-- no games is removed; one that a game names (even a game in the bin) stays.
create table public.rounds (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  number integer not null,
  label text,
  -- The round's day, as a date (T-42). Empty: not set yet.
  date date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rounds_league_id_key unique (league_id, id),
  -- What a game names, so its round is of its season.
  constraint rounds_season_id_key unique (league_id, season_id, id),
  constraint rounds_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint rounds_number_key unique (league_id, season_id, number),
  constraint rounds_number_range check (number between 1 and 1000),
  constraint rounds_label_length check (label is null or length(btrim(label)) between 1 and 120),
  constraint rounds_date_plausible check (date is null or date between date '1900-01-01' and date '2999-12-31'),
  constraint rounds_version_positive check (version > 0)
);

comment on table public.rounds is
  'A week or round of a season (T3 §8): its number (unique in the season), an optional label and date.';

-- Stages (T3 §8) ------------------------------------------------------------------

-- The regular season or, later, a bracket (S-4). For now each season has at most
-- one stage, its regular season: the playoffs migration widens stages_type and adds
-- bracket_slots. `config` is a small versioned document (T-44, T-50) whose shape
-- the stage's type gives in code.
create table public.stages (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  type text not null default 'regular',
  name text not null,
  config jsonb not null default '{"version": 1}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stages_league_id_key unique (league_id, id),
  -- What a game names, so its stage is of its season.
  constraint stages_season_id_key unique (league_id, season_id, id),
  constraint stages_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint stages_type check (type in ('regular')),
  constraint stages_name_length check (length(btrim(name)) between 1 and 120),
  constraint stages_config_document check (public.is_versioned_document(config)),
  constraint stages_config_size check (octet_length(config::text) <= 16384),
  constraint stages_version_positive check (version > 0)
);

create unique index stages_one_regular
  on public.stages (league_id, season_id) where type = 'regular';

comment on table public.stages is
  'A part of a season (T3 §8): for now only its regular season, one per season. Brackets come with the playoffs (S-4).';

-- Games (T3 §8, §12) ----------------------------------------------------------------

create table public.games (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  stage_id uuid not null,
  -- The division whose standings it counts in; empty for a game across divisions.
  division_id uuid,
  round_id uuid,
  -- The league's own number for the game (fixture lists, the import); optional.
  game_number integer,
  home_team_id uuid not null,
  away_team_id uuid not null,
  -- Empty: date and time not set yet (a postponed game waiting for a slot).
  starts_at timestamptz,
  venue_id uuid,
  court_id uuid,
  status text not null default 'scheduled',
  -- How the game is recorded (P7 §5.2): final score only, box score afterwards, or
  -- live, as T3 and packages/sports spell them (the season rules document's
  -- RecordingMode says final-score and box-score). No default: the season's rules
  -- give it (step 2.20).
  capture_mode text not null,
  home_score integer,
  away_score integer,
  -- Worked out from the scores of a decided game, so it can never disagree with
  -- them: the higher score wins, level scores have no winner.
  winner_team_id uuid generated always as (
    case
      when status in ('final', 'forfeit') and home_score > away_score then home_team_id
      when status in ('final', 'forfeit') and away_score > home_score then away_team_id
    end
  ) stored,
  -- The game rules it is played under (S-1, S-21): empty while it follows the
  -- season's rules; set when a game is given its own rules before it starts, or
  -- when it starts. A small versioned document whose shape is in code (T-50).
  format jsonb,
  finalized_at timestamptz,
  -- Where the fixture came from outside (an import's reference); optional.
  external_ref text,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_league_id_key unique (league_id, id),
  constraint games_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint games_stage foreign key (league_id, season_id, stage_id)
    references public.stages (league_id, season_id, id),
  constraint games_division foreign key (league_id, season_id, division_id)
    references public.divisions (league_id, season_id, id),
  constraint games_round foreign key (league_id, season_id, round_id)
    references public.rounds (league_id, season_id, id),
  -- Both teams of the game's own season (T3 §12), and never the same team.
  constraint games_home_team foreign key (league_id, season_id, home_team_id)
    references public.teams (league_id, season_id, id),
  constraint games_away_team foreign key (league_id, season_id, away_team_id)
    references public.teams (league_id, season_id, id),
  constraint games_teams_differ check (home_team_id <> away_team_id),
  constraint games_venue foreign key (league_id, venue_id)
    references public.venues (league_id, id),
  -- A court at the game's venue. A foreign key with an empty column checks
  -- nothing, so a court needs its venue named too.
  constraint games_court foreign key (league_id, venue_id, court_id)
    references public.courts (league_id, venue_id, id),
  constraint games_court_has_venue check (court_id is null or venue_id is not null),
  constraint games_status check (
    status in ('scheduled', 'live', 'final', 'postponed', 'cancelled', 'forfeit')
  ),
  constraint games_capture_mode check (capture_mode in ('final', 'box', 'live')),
  constraint games_game_number_range check (game_number is null or game_number between 1 and 100000),
  constraint games_score_range check (
    (home_score is null or home_score between 0 and 999)
    and (away_score is null or away_score between 0 and 999)
  ),
  -- Both scores or neither.
  constraint games_scores_paired check ((home_score is null) = (away_score is null)),
  -- T3 §12: a game not played (yet) has no score; a decided one has both.
  constraint games_unplayed_has_no_score check (
    status not in ('scheduled', 'postponed', 'cancelled') or home_score is null
  ),
  constraint games_decided_has_scores check (
    status not in ('final', 'forfeit') or home_score is not null
  ),
  constraint games_finalized_when_decided check (
    (status in ('final', 'forfeit')) = (finalized_at is not null)
  ),
  -- A forfeit has a winner and a loser (P7 §5.6), at the season's forfeit score.
  constraint games_forfeit_has_winner check (status <> 'forfeit' or home_score <> away_score),
  constraint games_format_document check (
    format is null or (public.is_versioned_document(format) and octet_length(format::text) <= 16384)
  ),
  constraint games_external_ref_length check (
    external_ref is null or length(btrim(external_ref)) between 1 and 200
  ),
  constraint games_version_positive check (version > 0)
);

-- The league's game numbers and outside references find one game in a season (the
-- fixture import matches by them, steps 2.10 and 2.22); a game in the bin lets both go.
create unique index games_game_number_key
  on public.games (league_id, season_id, game_number)
  where game_number is not null and deleted_at is null;
create unique index games_external_ref_key
  on public.games (league_id, season_id, external_ref)
  where external_ref is not null and deleted_at is null;
create index games_season_starts on public.games (league_id, season_id, starts_at);
create index games_home_team_lookup on public.games (home_team_id);
create index games_away_team_lookup on public.games (away_team_id);
create index games_stage_lookup on public.games (stage_id);
create index games_round_lookup on public.games (round_id) where round_id is not null;
create index games_division_lookup on public.games (division_id) where division_id is not null;
create index games_venue_lookup on public.games (venue_id) where venue_id is not null;
create index games_court_lookup on public.games (court_id) where court_id is not null;

comment on table public.games is
  'A published game (T3 §8). Its teams, division, round and stage are of its season; its scores fit its status (T3 §12); its winner follows from the scores; changing a decided result needs a correction (S-7).';

-- A game keeps the rules it started with (S-1: "a game already played keeps the
-- rules it was played under"; S-21: a game can be given its own rules before it
-- starts). Once a game is live or decided, its format is fixed; the scorekeeper's
-- changes at the table (the clock switch, corrections by hand) are plays, not
-- changes to the format.
create or replace function public.check_game_format_fixed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.status in ('live', 'final', 'forfeit') and new.format is distinct from old.format then
    raise exception 'game % has started, so the rules it is played under cannot change', new.id
      using errcode = 'restrict_violation', constraint = 'games_format_fixed_once_started';
  end if;
  return new;
end
$$;

comment on function public.check_game_format_fixed() is
  'BEFORE UPDATE OF format on games: refuses a change to the rules of a game that is live or decided (S-1, S-21).';

create trigger games_format_fixed_once_started
  before update of format on public.games
  for each row execute function public.check_game_format_fixed();

-- Schedule revisions and drafts (T3 §8, A-9) ------------------------------------------

-- Each publication of a season's schedule (A-6, A-9): numbered 1, 2, 3 ... in the
-- season, with what changed. History: never changed or removed. `summary` holds ids
-- and counts only, never names (T-220).
create table public.schedule_revisions (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  number integer not null,
  -- Empty for a publication the system made.
  published_by_account_id uuid references public.accounts (id),
  published_at timestamptz not null default now(),
  summary jsonb not null default '{"version": 1}',
  created_at timestamptz not null default now(),
  constraint schedule_revisions_league_id_key unique (league_id, id),
  constraint schedule_revisions_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  -- What a draft names as the revision it was based on.
  constraint schedule_revisions_number_key unique (league_id, season_id, number),
  constraint schedule_revisions_number_positive check (number >= 1),
  constraint schedule_revisions_summary_document check (public.is_versioned_document(summary)),
  constraint schedule_revisions_summary_size check (octet_length(summary::text) <= 65536)
);

comment on table public.schedule_revisions is
  'Each publication of a season''s schedule (T3 §8, A-6), numbered from 1 in the season. History: only ever added (T-45).';

-- Revision n follows revision n - 1 of the same season. Two publications at once
-- cannot both take the next number: schedule_revisions_number_key refuses the
-- second. This only looks for a row that is never removed, so it needs no lock and
-- is safe at every isolation level: a snapshot that cannot see the previous
-- revision yet refuses, never wrongly lets through.
create or replace function public.check_schedule_revision_in_order() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.number > 1 and not exists (
    select 1 from public.schedule_revisions r
    where r.league_id = new.league_id and r.season_id = new.season_id and r.number = new.number - 1
  ) then
    raise exception 'schedule revision % of this season comes before %', new.number - 1, new.number
      using errcode = 'check_violation', constraint = 'schedule_revisions_in_order';
  end if;
  return new;
end
$$;

comment on function public.check_schedule_revision_in_order() is
  'BEFORE INSERT on schedule_revisions: revision n needs revision n - 1 of the same season.';

create trigger schedule_revisions_in_order
  before insert on public.schedule_revisions
  for each row execute function public.check_schedule_revision_in_order();

create trigger schedule_revisions_is_history before update or delete on public.schedule_revisions
  for each row execute function public.refuse_history_change();

-- A season's unpublished schedule edits (A-9): one draft per season, the changes
-- as a versioned document whose shape is in code (step 2.9), and the revision they
-- were made on (empty before the first publication). Discarding the draft removes
-- the row. `version` stops two admins overwriting each other (A-8, T-46).
create table public.schedule_drafts (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  changes jsonb not null default '{"version": 1, "changes": []}',
  based_on_revision integer,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_drafts_league_id_key unique (league_id, id),
  constraint schedule_drafts_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint schedule_drafts_one_per_season unique (league_id, season_id),
  -- A revision of the same season that exists.
  constraint schedule_drafts_based_on foreign key (league_id, season_id, based_on_revision)
    references public.schedule_revisions (league_id, season_id, number),
  constraint schedule_drafts_changes_document check (public.is_versioned_document(changes)),
  -- Room for a whole season generated at once (a thousand games and more).
  constraint schedule_drafts_changes_size check (octet_length(changes::text) <= 1048576),
  constraint schedule_drafts_version_positive check (version > 0)
);

comment on table public.schedule_drafts is
  'A season''s unpublished schedule edits (T3 §8, A-9): one per season, based on a revision of it.';

-- Scorekeeper assignments (T3 §8, P7 §5.1) ---------------------------------------------

create table public.game_assignments (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  game_id uuid not null,
  account_id uuid not null references public.accounts (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_assignments_league_id_key unique (league_id, id),
  constraint game_assignments_game foreign key (league_id, game_id)
    references public.games (league_id, id),
  constraint game_assignments_once unique (league_id, game_id, account_id),
  constraint game_assignments_version_positive check (version > 0)
);

create index game_assignments_account_lookup on public.game_assignments (account_id, league_id);

comment on table public.game_assignments is
  'A scorekeeper assigned to a game (T3 §8, P7 §5.1), once per game. Removing the assignment removes the row.';

-- Game corrections (T3 §8, S-7, T6 §8) --------------------------------------------------

-- A decided game reopened or changed, with who, when and why (S-7). History: never
-- changed or removed. `before` and `after` are small versioned documents of the
-- game's result as it was and as the correction left it, with ids and numbers
-- only, never names (T-220). The public page shows "corrected" and the date, never
-- the reason.
create table public.game_corrections (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  game_id uuid not null,
  account_id uuid not null references public.accounts (id),
  reason text not null,
  before jsonb not null,
  after jsonb not null,
  -- When the correction was made: always the time of its transaction, set by the
  -- database (game_corrections_at_now), so the result change below can find it.
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint game_corrections_league_id_key unique (league_id, id),
  constraint game_corrections_game foreign key (league_id, game_id)
    references public.games (league_id, id),
  constraint game_corrections_reason_length check (length(btrim(reason)) between 1 and 1000),
  constraint game_corrections_before_document check (
    public.is_versioned_document(before) and octet_length(before::text) <= 16384
  ),
  constraint game_corrections_after_document check (
    public.is_versioned_document(after) and octet_length(after::text) <= 16384
  )
);

create index game_corrections_game_at on public.game_corrections (game_id, at);

comment on table public.game_corrections is
  'A decided game reopened or changed, with who, when and why (T3 §8, S-7). History: only ever added (T-45).';

create trigger game_corrections_is_history before update or delete on public.game_corrections
  for each row execute function public.refuse_history_change();

create or replace function public.stamp_game_correction() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.at := now();
  return new;
end
$$;

comment on function public.stamp_game_correction() is
  'BEFORE INSERT on game_corrections: the correction is dated by its own transaction, never by the caller.';

create trigger game_corrections_at_now before insert on public.game_corrections
  for each row execute function public.stamp_game_correction();

-- S-7: every correction is logged. A decided game (final or forfeit) whose status,
-- a score, a team, its division or stage (where the result counts) or the time it
-- was finalized changes, or that goes to the bin or comes back from it, needs a
-- correction row for that game written in the same transaction, before or after the change: the check waits
-- until the transaction commits. A correction is dated now() (the transaction's
-- start, set by the database), which is how it is told apart from older ones. It
-- reads only rows its own transaction wrote, so it needs no lock and holds at every
-- isolation level. Runs as the caller: the game and its corrections are one league's.
create or replace function public.check_game_result_corrected() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.game_corrections c
    where c.league_id = new.league_id and c.game_id = new.id and c.at = now()
  ) then
    raise exception 'game % was decided: changing its result needs a correction with a reason', new.id
      using errcode = 'check_violation', constraint = 'games_result_change_needs_correction',
            hint = 'Write a game_corrections row for this game in the same transaction (S-7).';
  end if;
  return null;
end
$$;

comment on function public.check_game_result_corrected() is
  'Deferred AFTER UPDATE on games: a decided game''s result changed only alongside a correction for it in the same transaction (S-7).';

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

-- The league purge removes these history tables too (T-220, record 007) ------------------

create or replace function public.purge_league_history(purged_league uuid) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.leagues l
    where l.id = purged_league and l.deleted_at <= now() - interval '30 days'
  ) then
    raise exception 'league % has not been in the bin for 30 days; its history stays', purged_league
      using errcode = 'restrict_violation';
  end if;
  perform set_config('srleagues.history_purge', purged_league::text, true);
  delete from public.activity_log where league_id = purged_league;
  delete from public.support_access_log where league_id = purged_league;
  delete from public.command_receipts where league_id = purged_league;
  -- A draft names the revision it was based on; the purge removes the league's
  -- drafts with everything else, so they go first.
  delete from public.schedule_drafts where league_id = purged_league;
  delete from public.schedule_revisions where league_id = purged_league;
  delete from public.game_corrections where league_id = purged_league;
  perform set_config('srleagues.history_purge', '', true);
end
$$;

revoke all on function public.purge_league_history(uuid) from public;

-- Every editable table moves version and updated_at on each change --------------------

-- Each stays in its season; a stage keeps its type; an assignment is to one game and
-- one account (a different one is a new row).
create trigger rounds_on_update before update on public.rounds
  for each row execute function public.on_row_update('season_id');
create trigger stages_on_update before update on public.stages
  for each row execute function public.on_row_update('season_id', 'type');
create trigger games_on_update before update on public.games
  for each row execute function public.on_row_update('season_id');
create trigger schedule_drafts_on_update before update on public.schedule_drafts
  for each row execute function public.on_row_update('season_id');
create trigger game_assignments_on_update before update on public.game_assignments
  for each row execute function public.on_row_update('game_id', 'account_id');

-- What app_user may do -----------------------------------------------------------------

-- A game leaves only through the bin: the app has no DELETE on games, so a decided
-- game cannot be removed past its correction rule. Removing binned games for good
-- (T-51) is the purge's work, as for leagues (record 007). History tables give
-- SELECT and INSERT only (0005).
grant select, insert, update, delete on public.rounds to app_user;
grant select, insert, update, delete on public.stages to app_user;
grant select, insert, update on public.games to app_user;
grant select, insert, update, delete on public.schedule_drafts to app_user;
grant select, insert on public.schedule_revisions to app_user;
grant select, insert, update, delete on public.game_assignments to app_user;
grant select, insert on public.game_corrections to app_user;

-- Row-level security: on, forced, one policy keyed to the league (T-61) -------------

alter table public.rounds enable row level security;
alter table public.rounds force row level security;
alter table public.stages enable row level security;
alter table public.stages force row level security;
alter table public.games enable row level security;
alter table public.games force row level security;
alter table public.schedule_revisions enable row level security;
alter table public.schedule_revisions force row level security;
alter table public.schedule_drafts enable row level security;
alter table public.schedule_drafts force row level security;
alter table public.game_assignments enable row level security;
alter table public.game_assignments force row level security;
alter table public.game_corrections enable row level security;
alter table public.game_corrections force row level security;

create policy rounds_league_fence on public.rounds
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy stages_league_fence on public.stages
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy games_league_fence on public.games
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy schedule_revisions_league_fence on public.schedule_revisions
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy schedule_drafts_league_fence on public.schedule_drafts
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy game_assignments_league_fence on public.game_assignments
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy game_corrections_league_fence on public.game_corrections
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

select migration_log.revoke_hosted_api_roles();
