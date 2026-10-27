-- Live stat tracking. Plain PostgreSQL: runs on embedded PGlite locally and on any
-- hosted PostgreSQL (Supabase included). No grants, roles or row-level security yet;
-- never expose a database with this schema to the internet as it stands.
CREATE SCHEMA IF NOT EXISTS live_stats;

CREATE TABLE IF NOT EXISTS live_stats.teams (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  school text NOT NULL DEFAULT '',
  -- The team this workspace keeps records for (Al-Hadi); everyone else is an opponent.
  tracked boolean NOT NULL DEFAULT false,
  source_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No limit on players per team. Removing a player only hides them from new lineups;
-- games they played keep their lines.
CREATE TABLE IF NOT EXISTS live_stats.players (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES live_stats.teams(id),
  name text NOT NULL DEFAULT '',
  jersey text NOT NULL DEFAULT '' CHECK (jersey ~ '^(|0|00|[1-9][0-9]?)$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (name <> '' OR jersey <> '')
);
CREATE INDEX IF NOT EXISTS players_team ON live_stats.players(team_id);

CREATE TABLE IF NOT EXISTS live_stats.games (
  id uuid PRIMARY KEY,
  season text NOT NULL,
  home_team_id uuid NOT NULL REFERENCES live_stats.teams(id),
  away_team_id uuid NOT NULL REFERENCES live_stats.teams(id),
  starts_at timestamptz,
  venue text NOT NULL DEFAULT '',
  venue_address text NOT NULL DEFAULT '',
  game_type text NOT NULL DEFAULT 'regular_season',
  -- Where the fixture came from, e.g. TCSAAL game 653. The league stays the official source.
  source text NOT NULL DEFAULT '',
  source_ref text UNIQUE,
  source_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'final')),
  home_score integer NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score integer NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  -- The tracker engine's state (packages/sports/src/basketball/live.ts): plays, clock, rules.
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id)
);
CREATE INDEX IF NOT EXISTS games_schedule ON live_stats.games(starts_at, id);

-- Every accepted scorer action, in order, saved in the same transaction as the game state.
CREATE TABLE IF NOT EXISTS live_stats.game_events (
  game_id uuid NOT NULL REFERENCES live_stats.games(id),
  sequence integer NOT NULL,
  command_id uuid NOT NULL,
  command jsonb NOT NULL,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY (game_id, sequence),
  UNIQUE (game_id, command_id)
);

-- Each player's box score line for a game, rewritten with every accepted action.
CREATE TABLE IF NOT EXISTS live_stats.player_game_lines (
  game_id uuid NOT NULL REFERENCES live_stats.games(id),
  player_id uuid NOT NULL REFERENCES live_stats.players(id),
  team_id uuid NOT NULL REFERENCES live_stats.teams(id),
  name text NOT NULL,
  jersey text NOT NULL,
  appeared boolean NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  fg1 integer NOT NULL CHECK (fg1 >= 0),
  fg2 integer NOT NULL CHECK (fg2 >= 0),
  fg3 integer NOT NULL CHECK (fg3 >= 0),
  fouls integer NOT NULL CHECK (fouls >= 0),
  ms bigint NOT NULL CHECK (ms >= 0),
  PRIMARY KEY (game_id, player_id),
  CHECK (points = fg1 + 2 * fg2 + 3 * fg3)
);
CREATE INDEX IF NOT EXISTS lines_player ON live_stats.player_game_lines(player_id);
