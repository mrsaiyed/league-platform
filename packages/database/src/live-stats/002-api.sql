-- The live stats API for the static site: pages on GitHub Pages talk to Supabase
-- directly, with no server of their own. Supabase publishes functions in the public
-- schema at /rest/v1/rpc/<name>; these are the only way in. Each runs as the owner of
-- the tables (SECURITY DEFINER), so the tables themselves stay closed to the public
-- API roles (see the end of 001-schema.sql).
--
--  - Reading (ls_teams, ls_games, ls_game, ...) is open to anyone: watching a game
--    needs no sign-in, as on the hosted server.
--  - Changing anything needs a scorer session: ls_sign_in with the scorer passcode
--    returns a token, good for 7 days, that every change carries.
--  - The passcode is set in Supabase's SQL editor, never in the repository:
--      select live_stats.set_scorer_passcode('your passcode');
--
-- The browser applies the basketball rules with the same engine as the server and
-- sends what an action produced; ls_record saves it all at once, only if the game is
-- still at the revision it was worked out from, and never twice for one action.
-- Safe to run again: everything is created if missing or replaced.

CREATE TABLE IF NOT EXISTS live_stats.settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE IF NOT EXISTS live_stats.sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS live_stats.sign_in_failures (
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE live_stats.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_stats.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_stats.sign_in_failures ENABLE ROW LEVEL SECURITY;

-- ---- scorer passcode and sessions -------------------------------------------------

-- Salted and stretched with the built-in sha256, so nothing beyond PostgreSQL is needed.
CREATE OR REPLACE FUNCTION live_stats.passcode_hash(p_passcode text, p_salt text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  h bytea := sha256(convert_to(p_salt || ':' || p_passcode, 'UTF8'));
BEGIN
  FOR i IN 1..10000 LOOP
    h := sha256(h);
  END LOOP;
  RETURN encode(h, 'hex');
END $$;

CREATE OR REPLACE FUNCTION live_stats.token_hash(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- Run in the SQL editor to set or change the passcode. Changing it signs every device out.
CREATE OR REPLACE FUNCTION live_stats.set_scorer_passcode(p_passcode text)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  salt text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF length(coalesce(p_passcode, '')) < 8 THEN
    RAISE EXCEPTION 'Use a scorer passcode of 8 characters or more (12 or more is best).';
  END IF;
  INSERT INTO live_stats.settings(key, value)
  VALUES ('passcode', salt || ':' || live_stats.passcode_hash(p_passcode, salt))
  ON CONFLICT (key) DO UPDATE SET value = excluded.value;
  DELETE FROM live_stats.sessions;
  RETURN 'Scorer passcode set. Scorers sign in with it on each device.';
END $$;

-- Raises "401" (PostgREST turns SQLSTATE PT401 into HTTP 401) without a live session.
CREATE OR REPLACE FUNCTION live_stats.require_scorer(p_token text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM live_stats.sessions
    WHERE token_hash = live_stats.token_hash(p_token) AND expires_at > now()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT401',
      MESSAGE = 'Sign in to score. Your taps are kept on this device until you do.';
  END IF;
END $$;

-- A wrong passcode is answered, not raised, so the failure is kept for the limit:
-- at most 20 wrong passcodes in 15 minutes, from anywhere.
CREATE OR REPLACE FUNCTION public.ls_sign_in(p_passcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  stored text;
  token text;
  expires timestamptz := now() + interval '7 days';
BEGIN
  SELECT value INTO stored FROM live_stats.settings WHERE key = 'passcode';
  IF stored IS NULL THEN
    RETURN jsonb_build_object('status', 503, 'error',
      'No scorer passcode is set yet. In Supabase''s SQL editor run: select live_stats.set_scorer_passcode(''your passcode'');');
  END IF;
  DELETE FROM live_stats.sign_in_failures WHERE at < now() - interval '15 minutes';
  DELETE FROM live_stats.sessions WHERE expires_at < now();
  IF (SELECT count(*) FROM live_stats.sign_in_failures) >= 20 THEN
    RETURN jsonb_build_object('status', 429, 'error',
      'Too many wrong passcodes. Wait 15 minutes and try again.');
  END IF;
  IF live_stats.passcode_hash(coalesce(p_passcode, ''), split_part(stored, ':', 1))
     IS DISTINCT FROM split_part(stored, ':', 2) THEN
    INSERT INTO live_stats.sign_in_failures DEFAULT VALUES;
    RETURN jsonb_build_object('status', 401, 'error', 'That passcode is not right.');
  END IF;
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO live_stats.sessions(token_hash, expires_at)
  VALUES (live_stats.token_hash(token), expires);
  RETURN jsonb_build_object('token', token, 'expiresAt', expires);
END $$;

CREATE OR REPLACE FUNCTION public.ls_session(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('canScore', EXISTS (
    SELECT 1 FROM live_stats.sessions
    WHERE token_hash = live_stats.token_hash(p_token) AND expires_at > now()
  ))
$$;

CREATE OR REPLACE FUNCTION public.ls_sign_out(p_token text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM live_stats.sessions WHERE token_hash = live_stats.token_hash(p_token);
  SELECT jsonb_build_object('canScore', false)
$$;

-- ---- records as the pages use them -----------------------------------------------

CREATE OR REPLACE FUNCTION live_stats.iso(t timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
CREATE OR REPLACE FUNCTION live_stats.epoch_ms(t timestamptz)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT floor(extract(epoch FROM t) * 1000)::bigint
$$;

CREATE OR REPLACE FUNCTION live_stats.team_json(t live_stats.teams)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'school', t.school,
    'tracked', t.tracked, 'sourceUrl', t.source_url)
$$;
CREATE OR REPLACE FUNCTION live_stats.player_json(p live_stats.players)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'teamId', p.team_id, 'name', p.name,
    'jersey', p.jersey, 'active', p.active)
$$;
CREATE OR REPLACE FUNCTION live_stats.game_json(g live_stats.games, p_state jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', g.id, 'season', g.season, 'homeTeamId', g.home_team_id,
    'awayTeamId', g.away_team_id, 'startsAt', live_stats.iso(g.starts_at), 'venue', g.venue,
    'venueAddress', g.venue_address, 'gameType', g.game_type, 'source', g.source,
    'sourceRef', g.source_ref, 'sourceUrl', g.source_url, 'status', g.status,
    'homeScore', g.home_score, 'awayScore', g.away_score, 'revision', g.revision,
    'state', p_state)
$$;
-- For lists, the game state without its plays, except period changes and team
-- turnovers: enough for the period, the clock and the team's own turnovers in the game
-- log, a small fraction of the size.
CREATE OR REPLACE FUNCTION live_stats.listed_state(p_state jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_state || jsonb_build_object(
    'plays', coalesce((
      SELECT jsonb_agg(p ORDER BY n) FROM jsonb_array_elements(p_state -> 'plays')
        WITH ORDINALITY AS x(p, n)
      WHERE p ->> 'type' IN ('period', 'team-turnover', 'team-unturnover')), '[]'::jsonb),
    'redo', '[]'::jsonb, 'recent', '[]'::jsonb)
$$;
CREATE OR REPLACE FUNCTION live_stats.line_json(l live_stats.player_game_lines)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('playerId', l.player_id, 'teamId', l.team_id, 'name', l.name,
    'jersey', l.jersey, 'appeared', l.appeared, 'points', l.points, 'fg1', l.fg1,
    'fg2', l.fg2, 'fg3', l.fg3, 'fouls', l.fouls, 'turnovers', l.turnovers, 'ms', l.ms)
$$;

-- ---- reading: open to anyone ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ls_teams()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(live_stats.team_json(t) ORDER BY t.tracked DESC, t.name), '[]')
  FROM live_stats.teams t
$$;

CREATE OR REPLACE FUNCTION public.ls_games(p_team_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(
    live_stats.game_json(g, live_stats.listed_state(g.state))
    ORDER BY g.starts_at NULLS LAST, g.created_at, g.id), '[]')
  FROM live_stats.games g
  WHERE p_team_id IS NULL OR g.home_team_id = p_team_id OR g.away_team_id = p_team_id
$$;

CREATE OR REPLACE FUNCTION public.ls_game(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'game', (SELECT live_stats.game_json(g, g.state) FROM live_stats.games g WHERE g.id = p_id),
    'now', live_stats.epoch_ms(clock_timestamp()))
$$;

-- What a watching page polls: changes when the game or either roster does.
CREATE OR REPLACE FUNCTION public.ls_game_version(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', coalesce((
      SELECT g.revision || ':' || coalesce((
        SELECT live_stats.epoch_ms(max(p.updated_at)) FROM live_stats.players p
        WHERE p.team_id IN (g.home_team_id, g.away_team_id)), 0)
      FROM live_stats.games g WHERE g.id = p_id), ''),
    'now', live_stats.epoch_ms(clock_timestamp()))
$$;

CREATE OR REPLACE FUNCTION public.ls_schedule_version()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', (SELECT count(*) || ':' || coalesce(sum(revision), 0) FROM live_stats.games),
    'now', live_stats.epoch_ms(clock_timestamp()))
$$;

CREATE OR REPLACE FUNCTION public.ls_players(p_team_ids jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(live_stats.player_json(p)
    ORDER BY (p.jersey = ''), nullif(p.jersey, '')::int, length(p.jersey) DESC, lower(p.name)),
    '[]')
  FROM live_stats.players p
  WHERE p.team_id IN (SELECT jsonb_array_elements_text(p_team_ids)::uuid)
$$;

CREATE OR REPLACE FUNCTION public.ls_player(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT live_stats.player_json(p) FROM live_stats.players p WHERE p.id = p_id
$$;

CREATE OR REPLACE FUNCTION public.ls_final_lines(p_team_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(live_stats.line_json(l) || jsonb_build_object('gameId', l.game_id)),
    '[]')
  FROM live_stats.player_game_lines l
  JOIN live_stats.games g ON g.id = l.game_id AND g.status = 'final'
  WHERE l.team_id = p_team_id
$$;

CREATE OR REPLACE FUNCTION public.ls_game_lines(p_game_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(live_stats.line_json(l)), '[]')
  FROM live_stats.player_game_lines l WHERE l.game_id = p_game_id
$$;

-- ---- changing: scorers only -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ls_ensure_team(p_token text, p_team jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t live_stats.teams;
BEGIN
  PERFORM live_stats.require_scorer(p_token);
  INSERT INTO live_stats.teams(id, slug, name, school, tracked, source_url)
  VALUES (gen_random_uuid(), p_team ->> 'slug', p_team ->> 'name',
    coalesce(p_team ->> 'school', ''), coalesce((p_team ->> 'tracked')::boolean, false),
    coalesce(p_team ->> 'sourceUrl', ''))
  ON CONFLICT (slug) DO UPDATE SET slug = excluded.slug
  RETURNING * INTO t;
  RETURN live_stats.team_json(t);
END $$;

CREATE OR REPLACE FUNCTION public.ls_upsert_fixture(p_token text, p_fixture jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM live_stats.require_scorer(p_token);
  INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, venue,
    venue_address, game_type, source, source_ref, source_url, state)
  VALUES ((p_fixture ->> 'id')::uuid, p_fixture ->> 'season',
    (p_fixture ->> 'homeTeamId')::uuid, (p_fixture ->> 'awayTeamId')::uuid,
    (p_fixture ->> 'startsAt')::timestamptz, coalesce(p_fixture ->> 'venue', ''),
    coalesce(p_fixture ->> 'venueAddress', ''),
    coalesce(p_fixture ->> 'gameType', 'regular_season'), coalesce(p_fixture ->> 'source', ''),
    p_fixture ->> 'sourceRef', coalesce(p_fixture ->> 'sourceUrl', ''), p_fixture -> 'state')
  ON CONFLICT (source_ref) DO UPDATE SET starts_at = excluded.starts_at,
    venue = excluded.venue, venue_address = excluded.venue_address,
    game_type = excluded.game_type, source_url = excluded.source_url,
    home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id
  WHERE live_stats.games.status = 'scheduled' AND live_stats.games.revision = 0;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.ls_add_player(p_token text, p_player jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p live_stats.players;
BEGIN
  PERFORM live_stats.require_scorer(p_token);
  INSERT INTO live_stats.players(id, team_id, name, jersey, active)
  VALUES ((p_player ->> 'id')::uuid, (p_player ->> 'teamId')::uuid,
    coalesce(p_player ->> 'name', ''), coalesce(p_player ->> 'jersey', ''),
    coalesce((p_player ->> 'active')::boolean, true))
  RETURNING * INTO p;
  RETURN live_stats.player_json(p);
END $$;

CREATE OR REPLACE FUNCTION public.ls_update_player(p_token text, p_id uuid, p_change jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p live_stats.players;
BEGIN
  PERFORM live_stats.require_scorer(p_token);
  UPDATE live_stats.players SET name = coalesce(p_change ->> 'name', name),
    jersey = coalesce(p_change ->> 'jersey', jersey),
    active = coalesce((p_change ->> 'active')::boolean, active), updated_at = now()
  WHERE id = p_id RETURNING * INTO p;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN live_stats.player_json(p);
END $$;

-- One scorer action, all or nothing: the action as received, the game's new state,
-- score and status, and its box score lines. 'duplicate' when this action is already
-- saved (a retry after a lost answer); 'conflict' when the game moved on since the
-- browser read it, so it reads again and works the action out afresh.
CREATE OR REPLACE FUNCTION public.ls_record(
  p_token text, p_game_id uuid, p_command_id uuid, p_revision integer, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_revision integer;
BEGIN
  PERFORM live_stats.require_scorer(p_token);
  SELECT revision INTO current_revision FROM live_stats.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'missing');
  END IF;
  IF EXISTS (SELECT 1 FROM live_stats.game_events
             WHERE game_id = p_game_id AND command_id = p_command_id) THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;
  IF current_revision <> p_revision THEN
    RETURN jsonb_build_object('result', 'conflict', 'revision', current_revision);
  END IF;
  INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at)
  VALUES (p_game_id, current_revision + 1, p_command_id, p_result -> 'command',
    coalesce((p_result ->> 'acceptedAt')::timestamptz, now()));
  UPDATE live_stats.games SET state = p_result -> 'state', status = p_result ->> 'status',
    home_score = (p_result ->> 'homeScore')::integer,
    away_score = (p_result ->> 'awayScore')::integer,
    revision = current_revision + 1, updated_at = now()
  WHERE id = p_game_id;
  DELETE FROM live_stats.player_game_lines WHERE game_id = p_game_id;
  INSERT INTO live_stats.player_game_lines(game_id, player_id, team_id, name, jersey,
    appeared, points, fg1, fg2, fg3, fouls, turnovers, ms)
  SELECT p_game_id, x."playerId", x."teamId", x.name, x.jersey, x.appeared, x.points, x.fg1,
    x.fg2, x.fg3, x.fouls, coalesce(x.turnovers, 0), x.ms
  FROM jsonb_to_recordset(coalesce(p_result -> 'lines', '[]'::jsonb)) AS x("playerId" uuid,
    "teamId" uuid, name text, jersey text, appeared boolean, points integer, fg1 integer,
    fg2 integer, fg3 integer, fouls integer, turnovers integer, ms bigint);
  RETURN jsonb_build_object('result', 'recorded', 'revision', current_revision + 1);
END $$;

-- ---- who may call what ------------------------------------------------------------

-- Helpers and the passcode setter are for the database owner only.
REVOKE ALL ON FUNCTION live_stats.set_scorer_passcode(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION live_stats.require_scorer(text) FROM PUBLIC;
DO $$
DECLARE
  api_role text;
  fn text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA live_stats FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SCHEMA live_stats FROM %I', api_role);
      FOREACH fn IN ARRAY ARRAY['ls_sign_in(text)', 'ls_session(text)', 'ls_sign_out(text)',
        'ls_teams()', 'ls_games(uuid)', 'ls_game(uuid)', 'ls_game_version(uuid)',
        'ls_schedule_version()', 'ls_players(jsonb)', 'ls_player(uuid)',
        'ls_final_lines(uuid)', 'ls_game_lines(uuid)', 'ls_ensure_team(text, jsonb)',
        'ls_upsert_fixture(text, jsonb)', 'ls_add_player(text, jsonb)',
        'ls_update_player(text, uuid, jsonb)', 'ls_record(text, uuid, uuid, integer, jsonb)']
      LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', fn, api_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
