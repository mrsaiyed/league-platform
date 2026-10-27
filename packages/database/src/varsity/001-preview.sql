-- Local rehearsal schema. No grants/RLS/authentication claim: never expose this service remotely.
-- PostgreSQL syntax and tenant keys are retained for the hosted production implementation.
CREATE SCHEMA IF NOT EXISTS varsity_preview;
CREATE TABLE IF NOT EXISTS varsity_preview.workspace (
  id uuid PRIMARY KEY, name text NOT NULL, roster_revision integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS varsity_preview.roster (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES varsity_preview.workspace(id),
  name text NOT NULL, jersey text NOT NULL, active boolean NOT NULL DEFAULT true,
  UNIQUE(workspace_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS roster_active_jersey ON varsity_preview.roster(workspace_id, jersey) WHERE active;
CREATE TABLE IF NOT EXISTS varsity_preview.games (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES varsity_preview.workspace(id),
  creation_command_id uuid NOT NULL, creation_hash text NOT NULL,
  opponent text NOT NULL, tracked_side text NOT NULL CHECK(tracked_side IN ('home','away')),
  scheduled_at timestamptz, venue text NOT NULL, source_url text NOT NULL,
  practice boolean NOT NULL, revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
  status text NOT NULL CHECK(status IN ('ready','live','final')),
  state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id), UNIQUE(workspace_id, creation_command_id)
);
CREATE TABLE IF NOT EXISTS varsity_preview.game_events (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, game_id uuid NOT NULL,
  sequence integer NOT NULL, command_id uuid NOT NULL, request_hash text NOT NULL,
  input jsonb NOT NULL, accepted_at timestamptz NOT NULL, result_status text NOT NULL,
  FOREIGN KEY(workspace_id, game_id) REFERENCES varsity_preview.games(workspace_id, id),
  UNIQUE(workspace_id, game_id, command_id), UNIQUE(workspace_id, game_id, sequence)
);
CREATE TABLE IF NOT EXISTS varsity_preview.player_game_lines (
  workspace_id uuid NOT NULL, game_id uuid NOT NULL, player_id uuid NOT NULL,
  name text NOT NULL, jersey text NOT NULL, tracked boolean NOT NULL, appeared boolean NOT NULL,
  points integer NOT NULL CHECK(points >= 0), ones integer NOT NULL CHECK(ones >= 0),
  twos integer NOT NULL CHECK(twos >= 0), threes integer NOT NULL CHECK(threes >= 0),
  fouls integer NOT NULL CHECK(fouls >= 0), milliseconds bigint NOT NULL CHECK(milliseconds >= 0),
  minutes_quality text NOT NULL CHECK(minutes_quality IN ('tracked','review-required')),
  PRIMARY KEY(workspace_id, game_id, player_id),
  FOREIGN KEY(workspace_id, game_id) REFERENCES varsity_preview.games(workspace_id, id),
  CHECK(points = ones + 2*twos + 3*threes)
);
CREATE INDEX IF NOT EXISTS games_schedule ON varsity_preview.games(workspace_id, scheduled_at, id);
CREATE INDEX IF NOT EXISTS lines_season ON varsity_preview.player_game_lines(workspace_id, tracked, player_id);
CREATE TABLE IF NOT EXISTS varsity_preview.roster_audit (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES varsity_preview.workspace(id),
  revision integer NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), player_count integer NOT NULL
);
