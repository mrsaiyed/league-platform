-- 0010: the live game (T3 §8, T6 §1): scoring sessions, game events, game states and
-- player game stats; the calculated tables (T3 §9): standings rows, standings
-- adjustments and season player totals; imports (T3 §11); and the mark on a roster
-- entry for a player added at the scorer's table (S-6). Decision record 030 (T-242)
-- explains the choices T3 left open.
--
-- Every table follows 0002 and 0005: a version 7 UUID id, created_at, a league_id
-- that every link includes (T-40), and its one forced row-level security policy
-- keyed to the league (T-61). Editable tables have updated_at and a version moved
-- by on_row_update (T-46). Game events are history: only ever added, never changed
-- or removed (T-45), except by the league purge (T-220).
--
-- The shapes follow the Al-Hadi tracker's own tables (packages/database/src/live-stats
-- /001-schema.sql), so its games carry over (T3 §8, step 2.58): its game_events
-- (sequence, command_id, command) are game_events (seq, command_id, type and payload);
-- the state it keeps on its games row is game_states.state; its player_game_lines
-- (appeared, ms, points, fg1, fg2, fg3, fouls, turnovers) are player_game_stats
-- (played, seconds_played, and the counts keyed by stat in `stats`).
--
-- Rules the database enforces here (T-47):
-- - within a game, each command_id and each seq appears once (T3 §12: a tap cannot be
--   saved twice), and seq n follows seq n - 1 of the same game; an event is never
--   changed or removed;
-- - one scoring session per game (S-5, T-116);
-- - one state per game; one stats line per person per game, for a team playing in it;
-- - one standings row per team per season, one seed per place in a table; one
--   season total per person per season;
-- - stat counts are whole numbers, 0 or more;
-- - an import's times fit its status;
-- - a roster entry flagged for review was added at a game's scorer's table.

-- Stat counts (T3 §8, P7 §5.6) ---------------------------------------------------------

-- A box score line's counts, keyed by stat (`{"points": 12, "fg2": 3}`): an object
-- whose keys are stat keys and whose values are whole numbers, 0 or more. Which
-- stats a sport has is the sport's (packages/sports), never the database's. Not a
-- versioned document: its keys are the stat catalogue's, and a missing key means the
-- stat was not recorded (packages/sports/src/stats/types.ts).
create or replace function public.is_stat_counts(counts jsonb) returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    jsonb_typeof(counts) = 'object'
      and not exists (
        select 1 from jsonb_each(counts) e
        where e.key !~ '^[A-Za-z][A-Za-z0-9_-]{0,39}$'
          or jsonb_typeof(e.value) <> 'number'
          or e.value::text !~ '^(0|[1-9][0-9]{0,6})$'
      ),
    false
  )
$$;

comment on function public.is_stat_counts(jsonb) is
  'A box score line''s counts: an object of stat keys to whole numbers from 0 to 9999999.';

revoke all on function public.is_stat_counts(jsonb) from public;
grant execute on function public.is_stat_counts(jsonb) to app_user;

-- Scoring sessions (T3 §8, S-5, T6 §5) ---------------------------------------------------

-- The one device currently scoring a game: a short lease the tracker renews while it
-- is open (T-116). Taking over changes the row's account and device; the session
-- ends by removing the row, or by its lease running out. Commands from a session
-- that no longer holds the game are refused by the scoring command, which compares
-- the session id the tracker sends with this row's id.
create table public.scoring_sessions (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  game_id uuid not null,
  account_id uuid not null references public.accounts (id),
  -- The device's own id for itself, made by the tracker.
  device_id text not null,
  held_until timestamptz not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scoring_sessions_league_id_key unique (league_id, id),
  constraint scoring_sessions_game foreign key (league_id, game_id)
    references public.games (league_id, id),
  constraint scoring_sessions_one_per_game unique (league_id, game_id),
  constraint scoring_sessions_device_id_length check (length(btrim(device_id)) between 1 and 200),
  constraint scoring_sessions_version_positive check (version > 0)
);

create index scoring_sessions_account_lookup on public.scoring_sessions (account_id, league_id);

comment on table public.scoring_sessions is
  'The one device currently scoring a game (T3 §8, S-5, T-116): who, which device, and until when its lease holds.';

-- Game events (T3 §8, §12, T6 §1, §3) ------------------------------------------------------

-- Every tap in the tracker, in the order the server accepted it. History: never
-- changed or removed (T-45). `type` and `payload` are the engine's command
-- (packages/sports/src/basketball/live.ts) split as T6 §3 sends it: the type, and
-- the rest. `account_id` names who scored it, by id only (T-220); it is empty for
-- an event the system wrote. `created_at` is when the server accepted it; `tapped_at`
-- is the device's time, which minutes and the clock are worked out from.
create table public.game_events (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  game_id uuid not null,
  seq integer not null,
  command_id uuid not null,
  type text not null,
  payload jsonb not null default '{}',
  tapped_at timestamptz not null,
  account_id uuid references public.accounts (id),
  created_at timestamptz not null default now(),
  constraint game_events_league_id_key unique (league_id, id),
  constraint game_events_game foreign key (league_id, game_id)
    references public.games (league_id, id),
  -- T3 §12: a tap cannot be saved twice, and two taps cannot take one place.
  constraint game_events_command_once unique (league_id, game_id, command_id),
  constraint game_events_seq_once unique (league_id, game_id, seq),
  constraint game_events_seq_positive check (seq >= 1),
  constraint game_events_type_format check (type ~ '^[a-z][a-z0-9-]{0,39}$'),
  constraint game_events_payload_object check (jsonb_typeof(payload) = 'object'),
  -- Room for the largest command, a whole set of game rules.
  constraint game_events_payload_size check (octet_length(payload::text) <= 16384)
);

create index game_events_account_lookup on public.game_events (account_id) where account_id is not null;

comment on table public.game_events is
  'Every tap in the tracker (T3 §8): its place in the game (seq), its command id, type and payload, and when it was tapped. Each command id and seq once per game (T3 §12). History: only ever added (T-45).';

create trigger game_events_is_history before update or delete on public.game_events
  for each row execute function public.refuse_history_change();

-- Event n follows event n - 1 of the same game, so the log has no gaps and a replay
-- is the whole game. Two taps at once cannot both take the next place:
-- game_events_seq_once refuses the second. As for schedule revisions (0009), this
-- looks only for a row that is never removed, so it needs no lock and holds at every
-- isolation level.
create or replace function public.check_game_event_in_order() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.seq > 1 and not exists (
    select 1 from public.game_events e
    where e.league_id = new.league_id and e.game_id = new.game_id and e.seq = new.seq - 1
  ) then
    raise exception 'event % of this game comes before %', new.seq - 1, new.seq
      using errcode = 'check_violation', constraint = 'game_events_in_order';
  end if;
  return new;
end
$$;

comment on function public.check_game_event_in_order() is
  'BEFORE INSERT on game_events: event n needs event n - 1 of the same game.';

create trigger game_events_in_order
  before insert on public.game_events
  for each row execute function public.check_game_event_in_order();

-- Game states (T3 §8, T6 §1) ------------------------------------------------------------------

-- The engine's latest state for a game, saved in the same transaction as the event
-- that made it (T6 §1). `seq` is the last event applied (0 before the first). The
-- state is the engine's versioned document (GameState, version 1), holding every
-- play, so a whole game fits.
create table public.game_states (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  game_id uuid not null,
  seq integer not null default 0,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_states_league_id_key unique (league_id, id),
  constraint game_states_game foreign key (league_id, game_id)
    references public.games (league_id, id),
  constraint game_states_one_per_game unique (league_id, game_id),
  constraint game_states_seq_range check (seq >= 0),
  constraint game_states_state_document check (public.is_versioned_document(state)),
  constraint game_states_state_size check (octet_length(state::text) <= 2097152),
  constraint game_states_version_positive check (version > 0)
);

comment on table public.game_states is
  'The engine''s latest state for a game (T3 §8): one per game, with the last event it applied.';

-- Player game stats (T3 §8, P7 §5.6) ---------------------------------------------------------

-- One player's line in one game, rewritten with every accepted tap (as the tracker
-- does) or entered as a box score afterwards. `seconds_played` is empty when minutes
-- were not recorded. `jersey_number` is the number worn in this game, since a
-- roster's number can change later; names are never copied here (T-220): the
-- person row gives them.
create table public.player_game_stats (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  game_id uuid not null,
  team_id uuid not null,
  person_id uuid not null,
  jersey_number text,
  played boolean not null default false,
  seconds_played integer,
  stats jsonb not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_game_stats_league_id_key unique (league_id, id),
  constraint player_game_stats_game foreign key (league_id, game_id)
    references public.games (league_id, id),
  constraint player_game_stats_team foreign key (league_id, team_id)
    references public.teams (league_id, id),
  constraint player_game_stats_person foreign key (league_id, person_id)
    references public.people (league_id, id),
  constraint player_game_stats_once unique (league_id, game_id, person_id),
  constraint player_game_stats_jersey_format check (
    jersey_number is null or jersey_number ~ '^(0|00|[1-9][0-9]?)$'
  ),
  -- Up to a full day: more than any game, and room for long overtimes.
  constraint player_game_stats_seconds_range check (
    seconds_played is null or seconds_played between 0 and 86400
  ),
  constraint player_game_stats_stats_counts check (public.is_stat_counts(stats)),
  constraint player_game_stats_stats_size check (octet_length(stats::text) <= 8192),
  constraint player_game_stats_version_positive check (version > 0)
);

create index player_game_stats_person_lookup on public.player_game_stats (person_id);
create index player_game_stats_team_lookup on public.player_game_stats (team_id);

comment on table public.player_game_stats is
  'One player''s line in one game (T3 §8): for one of the game''s two teams, whether they played, seconds played, and counts keyed by stat.';

-- A line is for one of the game's two teams. Runs as the caller: the game and its
-- lines are one league's. It takes no lock: a game's teams change only by a schedule
-- edit or a correction, after which the lines are worked out again.
create or replace function public.check_player_game_team() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.games g
    where g.league_id = new.league_id and g.id = new.game_id
      and new.team_id in (g.home_team_id, g.away_team_id)
  ) and exists (
    -- No such game: player_game_stats_game answers that.
    select 1 from public.games g where g.league_id = new.league_id and g.id = new.game_id
  ) then
    raise exception 'team % does not play in game %', new.team_id, new.game_id
      using errcode = 'check_violation', constraint = 'player_game_stats_team_in_game';
  end if;
  return new;
end
$$;

comment on function public.check_player_game_team() is
  'BEFORE INSERT OR UPDATE on player_game_stats: the line''s team is one of the game''s two teams.';

create trigger player_game_stats_team_in_game
  before insert or update of game_id, team_id on public.player_game_stats
  for each row execute function public.check_player_game_team();

-- Standings rows (T3 §9, S-9) ------------------------------------------------------------------

-- One team's place in its table, as step 2.7's calculation worked it out. Never
-- edited by hand (A-12, S-9): rebuilt from the games whenever a result changes, in
-- the same transaction, and can be rebuilt from scratch. The win percentage and
-- point difference follow from the counts and are not stored.
create table public.standings_rows (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  -- The table it sits in; empty for a season without divisions.
  division_id uuid,
  team_id uuid not null,
  rank integer not null,
  seed integer not null,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  -- Standings points; empty when the season ranks by win percentage.
  standings_points integer,
  -- The current run of results, latest first; empty before any game.
  streak_result text,
  streak_length integer,
  -- What decided its place: empty when its record alone did, a tiebreaker, or
  -- still-tied (packages/sports/src/standings DecidedBy).
  decided_by text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standings_rows_league_id_key unique (league_id, id),
  constraint standings_rows_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint standings_rows_division foreign key (league_id, season_id, division_id)
    references public.divisions (league_id, season_id, id),
  constraint standings_rows_team foreign key (league_id, season_id, team_id)
    references public.teams (league_id, season_id, id),
  constraint standings_rows_team_once unique (league_id, season_id, team_id),
  constraint standings_rows_place_positive check (rank >= 1 and seed >= 1),
  constraint standings_rows_counts_range check (
    games_played between 0 and 100000
    and wins between 0 and 100000
    and losses between 0 and 100000
    and ties between 0 and 100000
    and points_for between 0 and 100000000
    and points_against between 0 and 100000000
  ),
  constraint standings_rows_points_range check (
    standings_points is null or standings_points between -1000000 and 1000000
  ),
  -- Both or neither (a CHECK that is NULL would pass, so the pairing is tested first).
  constraint standings_rows_streak check (
    (streak_result is null) = (streak_length is null)
    and (streak_result is null or (streak_result in ('won', 'lost', 'tied') and streak_length >= 1))
  ),
  constraint standings_rows_decided_by check (
    decided_by is null or decided_by in (
      'head-to-head', 'point-difference', 'points-scored', 'fewest-points-allowed',
      'coin-flip', 'still-tied'
    )
  ),
  constraint standings_rows_version_positive check (version > 0)
);

-- Seeds run 1 to n with no repeats in each table (a season without divisions is one table).
create unique index standings_rows_seed_once
  on public.standings_rows (league_id, season_id, division_id, seed) nulls not distinct;
create index standings_rows_team_lookup on public.standings_rows (team_id);
create index standings_rows_division_lookup on public.standings_rows (division_id) where division_id is not null;

comment on table public.standings_rows is
  'A team''s place in its season''s table (T3 §9), worked out from games and adjustments; never edited by hand (S-9).';

-- Standings adjustments (T3 §9, S-10) ----------------------------------------------------------

-- An admin's change to a team's record, with its reason (S-10): whole-number changes
-- to wins, losses, ties and standings points, which the calculation reads
-- (StandingsAdjustment). Removed adjustments go to the bin (T-45). The reason is shown
-- under the table, so it is the league's own words; who entered it is an id only.
create table public.standings_adjustments (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  team_id uuid not null,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  points integer not null default 0,
  reason text not null,
  account_id uuid not null references public.accounts (id),
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standings_adjustments_league_id_key unique (league_id, id),
  constraint standings_adjustments_team foreign key (league_id, season_id, team_id)
    references public.teams (league_id, season_id, id),
  constraint standings_adjustments_range check (
    wins between -1000 and 1000
    and losses between -1000 and 1000
    and ties between -1000 and 1000
    and points between -10000 and 10000
  ),
  constraint standings_adjustments_changes_something check (
    wins <> 0 or losses <> 0 or ties <> 0 or points <> 0
  ),
  constraint standings_adjustments_reason_length check (length(btrim(reason)) between 1 and 500),
  constraint standings_adjustments_version_positive check (version > 0)
);

create index standings_adjustments_season_lookup
  on public.standings_adjustments (league_id, season_id) where deleted_at is null;
create index standings_adjustments_team_lookup on public.standings_adjustments (team_id);

comment on table public.standings_adjustments is
  'An admin''s change to a team''s standings, with its reason (T3 §9, S-10). It feeds the calculation; removing it sends it to the bin.';

-- Season player totals (T3 §9, S-11) ------------------------------------------------------------

-- One player's totals for a season, worked out from the season's counted games
-- (PlayerSeasonTotals in packages/sports/src/stats). Never edited by hand: rebuilt
-- when a result changes, and can be rebuilt from scratch. `stats` is a versioned
-- document holding each stat's total and the games it was recorded in, which the
-- averages need.
create table public.season_player_totals (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  season_id uuid not null,
  person_id uuid not null,
  games_played integer not null default 0,
  -- Time on court over the games where minutes were recorded, and how many those were.
  seconds_played integer not null default 0,
  seconds_games integer not null default 0,
  stats jsonb not null default '{"version": 1, "stats": {}}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_player_totals_league_id_key unique (league_id, id),
  constraint season_player_totals_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint season_player_totals_person foreign key (league_id, person_id)
    references public.people (league_id, id),
  constraint season_player_totals_once unique (league_id, season_id, person_id),
  constraint season_player_totals_counts_range check (
    games_played between 0 and 100000
    and seconds_games between 0 and games_played
    and seconds_played between 0 and 2000000000
  ),
  constraint season_player_totals_stats_document check (public.is_versioned_document(stats)),
  constraint season_player_totals_stats_size check (octet_length(stats::text) <= 16384),
  constraint season_player_totals_version_positive check (version > 0)
);

create index season_player_totals_person_lookup on public.season_player_totals (person_id);

comment on table public.season_player_totals is
  'One player''s totals for a season (T3 §9): games played, minutes, and each stat''s total; worked out from games, never edited by hand.';

-- Imports (T3 §11, T-80) ------------------------------------------------------------------------

-- A spreadsheet import: what kind, where it stands, the report the admin previews,
-- and what applying it created, so undo removes exactly that (steps 2.22, 2.75). The
-- file itself is never kept (T-80); only its name, for the admin's list. `report`
-- and `created` are versioned documents whose shapes are in code, holding ids and
-- the file's own words only.
create table public.imports (
  id uuid primary key default public.uuid_v7(),
  league_id uuid not null references public.leagues (id),
  -- The season it goes into; empty for people, who belong to the league.
  season_id uuid,
  kind text not null,
  status text not null default 'reading',
  account_id uuid not null references public.accounts (id),
  file_name text,
  report jsonb not null default '{"version": 1}',
  created jsonb not null default '{"version": 1}',
  applied_at timestamptz,
  undone_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imports_league_id_key unique (league_id, id),
  constraint imports_season foreign key (league_id, season_id)
    references public.seasons (league_id, id),
  constraint imports_kind check (kind in ('fixtures', 'people', 'teams')),
  -- Read by the worker, ready to preview, applied, undone, or the file could not be read.
  constraint imports_status check (status in ('reading', 'ready', 'applied', 'undone', 'failed')),
  constraint imports_file_name_length check (
    file_name is null or length(btrim(file_name)) between 1 and 255
  ),
  constraint imports_applied_when check (
    (status in ('applied', 'undone')) = (applied_at is not null)
  ),
  constraint imports_undone_when check ((status = 'undone') = (undone_at is not null)),
  constraint imports_undone_after_applied check (undone_at is null or undone_at >= applied_at),
  constraint imports_report_document check (public.is_versioned_document(report)),
  constraint imports_report_size check (octet_length(report::text) <= 1048576),
  constraint imports_created_document check (public.is_versioned_document(created)),
  constraint imports_created_size check (octet_length(created::text) <= 2097152),
  constraint imports_version_positive check (version > 0)
);

create index imports_league_recent on public.imports (league_id, created_at);
create index imports_season_lookup on public.imports (season_id) where season_id is not null;

comment on table public.imports is
  'A spreadsheet import (T3 §11): its kind, status, report, and what it created so it can be undone. The file is never kept (T-80).';

-- Players added at the scorer's table (S-6) ------------------------------------------------------

-- A roster entry made at a game's scorer's table names that game, and keeps naming
-- it. While the league flags such players, the entry needs the admin's review until
-- they confirm it or fix the details (step 2.71). Only an entry added at the table
-- can be waiting for review.
alter table public.roster_entries
  add column added_at_game_id uuid,
  add column needs_review boolean not null default false;
alter table public.roster_entries
  add constraint roster_entries_added_at_game foreign key (league_id, added_at_game_id)
    references public.games (league_id, id);
alter table public.roster_entries
  add constraint roster_entries_review_only_when_added check (
    not needs_review or added_at_game_id is not null
  );

create index roster_entries_added_at_game_lookup
  on public.roster_entries (added_at_game_id) where added_at_game_id is not null;
create index roster_entries_to_review
  on public.roster_entries (league_id) where needs_review;

comment on column public.roster_entries.added_at_game_id is
  'The game at whose scorer''s table this person was added (S-6); empty for everyone else. Never changes.';
comment on column public.roster_entries.needs_review is
  'Added at the scorer''s table while the league flags such players, and not yet confirmed by an admin (S-6).';

-- Where a roster entry was added is fixed, like its team and person.
drop trigger roster_entries_on_update on public.roster_entries;
create trigger roster_entries_on_update before update on public.roster_entries
  for each row execute function public.on_row_update('team_id', 'person_id', 'added_at_game_id');

-- The league purge removes game events too (T-220, record 007) ------------------------------

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
  delete from public.game_events where league_id = purged_league;
  perform set_config('srleagues.history_purge', '', true);
end
$$;

revoke all on function public.purge_league_history(uuid) from public;

-- Every editable table moves version and updated_at on each change ------------------------------

-- Each row stays with its game, season, team or person; a session stays with its game
-- (taking over changes its account and device); an import keeps its kind, season and
-- who started it.
create trigger scoring_sessions_on_update before update on public.scoring_sessions
  for each row execute function public.on_row_update('game_id');
create trigger game_states_on_update before update on public.game_states
  for each row execute function public.on_row_update('game_id');
create trigger player_game_stats_on_update before update on public.player_game_stats
  for each row execute function public.on_row_update('game_id', 'person_id');
create trigger standings_rows_on_update before update on public.standings_rows
  for each row execute function public.on_row_update('season_id', 'team_id');
create trigger standings_adjustments_on_update before update on public.standings_adjustments
  for each row execute function public.on_row_update('season_id', 'team_id', 'account_id');
create trigger season_player_totals_on_update before update on public.season_player_totals
  for each row execute function public.on_row_update('season_id', 'person_id');
create trigger imports_on_update before update on public.imports
  for each row execute function public.on_row_update('season_id', 'kind', 'account_id');

-- What app_user may do -------------------------------------------------------------------------

-- Game events are history: SELECT and INSERT only (0005). A game's state stays while
-- the game does (games leave only through the bin). Lines, standings rows and season
-- totals are rebuilt, so they can be removed. Adjustments go to the bin; imports stay
-- as the record of what was brought in and undone.
grant select, insert, update, delete on public.scoring_sessions to app_user;
grant select, insert on public.game_events to app_user;
grant select, insert, update on public.game_states to app_user;
grant select, insert, update, delete on public.player_game_stats to app_user;
grant select, insert, update, delete on public.standings_rows to app_user;
grant select, insert, update on public.standings_adjustments to app_user;
grant select, insert, update, delete on public.season_player_totals to app_user;
grant select, insert, update on public.imports to app_user;

-- Row-level security: on, forced, one policy keyed to the league (T-61) -------------

alter table public.scoring_sessions enable row level security;
alter table public.scoring_sessions force row level security;
alter table public.game_events enable row level security;
alter table public.game_events force row level security;
alter table public.game_states enable row level security;
alter table public.game_states force row level security;
alter table public.player_game_stats enable row level security;
alter table public.player_game_stats force row level security;
alter table public.standings_rows enable row level security;
alter table public.standings_rows force row level security;
alter table public.standings_adjustments enable row level security;
alter table public.standings_adjustments force row level security;
alter table public.season_player_totals enable row level security;
alter table public.season_player_totals force row level security;
alter table public.imports enable row level security;
alter table public.imports force row level security;

create policy scoring_sessions_league_fence on public.scoring_sessions
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy game_events_league_fence on public.game_events
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy game_states_league_fence on public.game_states
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy player_game_stats_league_fence on public.player_game_stats
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy standings_rows_league_fence on public.standings_rows
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy standings_adjustments_league_fence on public.standings_adjustments
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy season_player_totals_league_fence on public.season_player_totals
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

create policy imports_league_fence on public.imports
  using (league_id = (select public.current_league_id()))
  with check (league_id = (select public.current_league_id()));

select migration_log.revoke_hosted_api_roles();
