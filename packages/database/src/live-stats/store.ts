import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Envelope, PlayerInput } from '../../../contracts/src/live-stats.ts';
import { apply, derive, newGame, DEFAULT_RULES } from '../../../sports/src/basketball/live.ts';
import type { Command, GameState } from '../../../sports/src/basketball/live.ts';

/**
 * The SQL the store needs. Embedded PGlite provides it for local use; an adapter
 * over a `pg` pool provides the same for hosted PostgreSQL such as Supabase.
 */
export type Sql = { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
export type Db = Sql & {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
};

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** A season's fixtures as copied from the league's published schedule. */
export type ScheduleSeed = {
  season: string;
  source: string;
  team: { slug: string; name: string; school: string; sourceUrl: string };
  opponents: { slug: string; name: string; school: string }[];
  games: {
    number: number;
    startsAt: string;
    home: string;
    away: string;
    type: string;
    venue: string;
    address: string;
    sourceUrl: string;
  }[];
};

type TeamRow = { id: string; slug: string; name: string; school: string; tracked: boolean };
type GameRow = {
  id: string;
  season: string;
  home_team_id: string;
  away_team_id: string;
  starts_at: Date | string | null;
  venue: string;
  venue_address: string;
  game_type: string;
  source: string;
  source_ref: string | null;
  source_url: string;
  status: 'scheduled' | 'live' | 'final';
  home_score: number;
  away_score: number;
  revision: number;
  state: GameState;
};
export type PlayerRow = {
  id: string;
  teamId: string;
  name: string;
  jersey: string;
  active: boolean;
};

const team = (t: TeamRow | undefined) =>
  t ? { id: t.id, slug: t.slug, name: t.name, school: t.school, tracked: t.tracked } : null;
const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());
const PLAYER_COLUMNS = 'id, team_id AS "teamId", name, jersey, active';
// By jersey as the pages sort: 00, 0, 1 … 99, then players with no number by name.
const JERSEY_ORDER = (col: string) => `(${col} = ''), nullif(${col}, '')::int, length(${col}) DESC`;
const PLAYER_ORDER = `${JERSEY_ORDER('jersey')}, lower(name)`;

/** Saves every accepted scorer action, with the game state and box score lines it produces. */
export class LiveStatsStore {
  db: Db;
  now: () => number;
  constructor(db: Db, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  async initialize() {
    await this.db.exec(await readFile(new URL('./001-schema.sql', import.meta.url), 'utf8'));
  }

  /**
   * Add the season's teams and fixtures. Safe to run on every start: existing
   * teams are kept as they are, and a fixture is only updated (rescheduled,
   * moved) while it has not been played.
   */
  async seed(seed: ScheduleSeed) {
    await this.db.transaction(async (tx) => {
      const ids = new Map<string, string>();
      const teams = [
        { ...seed.team, tracked: true },
        ...seed.opponents.map((o) => ({ ...o, sourceUrl: '', tracked: false })),
      ];
      for (const t of teams) {
        const row = await tx.query<{ id: string }>(
          `INSERT INTO live_stats.teams(id, slug, name, school, tracked, source_url)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (slug) DO UPDATE SET slug = excluded.slug RETURNING id`,
          [randomUUID(), t.slug, t.name, t.school, t.tracked, t.sourceUrl],
        );
        ids.set(t.slug, row.rows[0]!.id);
      }
      const state = JSON.stringify(newGame(DEFAULT_RULES, this.now()));
      for (const g of seed.games) {
        const home = ids.get(g.home),
          away = ids.get(g.away);
        if (!home || !away) throw new Error(`Seed game ${g.number} names an unknown team.`);
        await tx.query(
          `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, venue,
             venue_address, game_type, source, source_ref, source_url, state)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (source_ref) DO UPDATE SET starts_at = excluded.starts_at,
             venue = excluded.venue, venue_address = excluded.venue_address,
             game_type = excluded.game_type, source_url = excluded.source_url,
             home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id
           WHERE live_stats.games.status = 'scheduled' AND live_stats.games.revision = 0`,
          [
            randomUUID(),
            seed.season,
            home,
            away,
            g.startsAt,
            g.venue,
            g.address,
            g.type,
            seed.source,
            `${seed.source.toLowerCase()}:${g.number}`,
            g.sourceUrl,
            state,
          ],
        );
      }
    });
  }

  async schedule() {
    const games = await this.db.query<GameRow>(
      'SELECT * FROM live_stats.games ORDER BY starts_at NULLS LAST, created_at',
    );
    const teams = await this.teams();
    const tracked = teams.find((t) => t.tracked) ?? null;
    const now = this.now();
    return {
      team: tracked,
      games: games.rows.map((g) => summary(g, teams, now)),
      serverTime: now,
    };
  }

  async game(id: string) {
    const g = (await this.db.query<GameRow>('SELECT * FROM live_stats.games WHERE id = $1', [id]))
      .rows[0];
    if (!g) throw new StoreError('Game not found.', 404);
    const players = await this.db.query<PlayerRow>(
      `SELECT ${PLAYER_COLUMNS} FROM live_stats.players WHERE team_id IN ($1, $2) ORDER BY ${PLAYER_ORDER}`,
      [g.home_team_id, g.away_team_id],
    );
    return { ...summary(g, await this.teams(), this.now()), players: players.rows, state: g.state };
  }

  /**
   * Apply one scorer action and save it: the action itself, the new game state,
   * the score and every player's line, all in one transaction. Repeating an
   * action id that was already accepted changes nothing, so a retry after a
   * lost response is safe.
   */
  async command(gameId: string, raw: unknown) {
    const envelope = Envelope.parse(raw);
    const input = envelope.input as Command;
    const changed = await this.db.transaction(async (tx) => {
      const g = (
        await tx.query<GameRow>('SELECT * FROM live_stats.games WHERE id = $1 FOR UPDATE', [gameId])
      ).rows[0];
      if (!g) throw new StoreError('Game not found.', 404);
      const prior = await tx.query(
        'SELECT 1 FROM live_stats.game_events WHERE game_id = $1 AND command_id = $2',
        [gameId, envelope.commandId],
      );
      if (prior.rows.length) return false;
      await checkPlayers(tx, g, input);

      const serverNow = this.now();
      const at = Math.min(serverNow, envelope.at ?? serverNow);
      const next = apply(g.state, input, { id: envelope.commandId, now: at });
      const d = derive(next);
      await tx.query(
        `INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          gameId,
          g.revision + 1,
          envelope.commandId,
          JSON.stringify({ at: envelope.at ?? null, input }),
          new Date(serverNow).toISOString(),
        ],
      );
      await tx.query(
        `UPDATE live_stats.games SET state = $2, status = $3, home_score = $4, away_score = $5,
           revision = revision + 1, updated_at = now() WHERE id = $1`,
        [gameId, JSON.stringify(next), next.status, d.teams.home.score, d.teams.away.score],
      );
      await tx.query('DELETE FROM live_stats.player_game_lines WHERE game_id = $1', [gameId]);
      const lines = Object.entries(d.players).map(([playerId, l]) => ({
        player_id: playerId,
        appeared: l.appeared,
        points: l.points,
        fg1: l.fg1,
        fg2: l.fg2,
        fg3: l.fg3,
        fouls: l.fouls,
        ms: Math.round(l.ms),
      }));
      if (lines.length)
        await tx.query(
          `INSERT INTO live_stats.player_game_lines(game_id, player_id, team_id, name, jersey,
             appeared, points, fg1, fg2, fg3, fouls, ms)
           SELECT $1, p.id, p.team_id, p.name, p.jersey, x.appeared, x.points, x.fg1, x.fg2,
             x.fg3, x.fouls, x.ms
           FROM jsonb_to_recordset($2::jsonb) AS x(player_id uuid, appeared boolean,
             points integer, fg1 integer, fg2 integer, fg3 integer, fouls integer, ms bigint)
           JOIN live_stats.players p ON p.id = x.player_id`,
          [gameId, JSON.stringify(lines)],
        );
      return true;
    });
    return { changed, game: await this.game(gameId) };
  }

  async addPlayer(teamId: string, raw: unknown) {
    const input = PlayerInput.parse(raw);
    const found = await this.db.query('SELECT 1 FROM live_stats.teams WHERE id = $1', [teamId]);
    if (!found.rows.length) throw new StoreError('Team not found.', 404);
    const id = randomUUID();
    await this.db.query(
      'INSERT INTO live_stats.players(id, team_id, name, jersey) VALUES ($1, $2, $3, $4)',
      [id, teamId, input.name, input.jersey],
    );
    return this.player(id);
  }

  async updatePlayer(id: string, raw: unknown) {
    const input = PlayerInput.parse(raw);
    const row = await this.db.query<PlayerRow>(
      `UPDATE live_stats.players SET name = $2, jersey = $3, updated_at = now()
       WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
      [id, input.name, input.jersey],
    );
    if (!row.rows[0]) throw new StoreError('Player not found.', 404);
    return row.rows[0];
  }

  /** Off the roster for new lineups; lines already recorded stay. */
  async removePlayer(id: string) {
    const row = await this.db.query<PlayerRow>(
      `UPDATE live_stats.players SET active = false, updated_at = now()
       WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
      [id],
    );
    if (!row.rows[0]) throw new StoreError('Player not found.', 404);
    return row.rows[0];
  }

  async player(id: string) {
    const row = await this.db.query<PlayerRow>(
      `SELECT ${PLAYER_COLUMNS} FROM live_stats.players WHERE id = $1`,
      [id],
    );
    if (!row.rows[0]) throw new StoreError('Player not found.', 404);
    return row.rows[0];
  }

  /** A team's roster, record and season totals from its final games. */
  async team(id: string) {
    const teams = await this.teams();
    const t = teams.find((x) => x.id === id);
    if (!t) throw new StoreError('Team not found.', 404);
    const players = await this.db.query<PlayerRow>(
      `SELECT ${PLAYER_COLUMNS} FROM live_stats.players WHERE team_id = $1 AND active ORDER BY ${PLAYER_ORDER}`,
      [id],
    );
    const stats = await this.db.query<{
      playerId: string;
      name: string;
      jersey: string;
      active: boolean;
      gp: number;
      points: number;
      fg1: number;
      fg2: number;
      fg3: number;
      fouls: number;
      ms: number;
    }>(
      `SELECT p.id AS "playerId", p.name, p.jersey, p.active,
         count(l.game_id) FILTER (WHERE l.appeared)::int AS gp,
         coalesce(sum(l.points), 0)::int AS points, coalesce(sum(l.fg1), 0)::int AS fg1,
         coalesce(sum(l.fg2), 0)::int AS fg2, coalesce(sum(l.fg3), 0)::int AS fg3,
         coalesce(sum(l.fouls), 0)::int AS fouls, coalesce(sum(l.ms), 0)::float8 AS ms
       FROM live_stats.players p
       LEFT JOIN (live_stats.player_game_lines l
         JOIN live_stats.games g ON g.id = l.game_id AND g.status = 'final')
         ON l.player_id = p.id
       WHERE p.team_id = $1
       GROUP BY p.id, p.name, p.jersey, p.active
       HAVING p.active OR count(l.game_id) > 0
       ORDER BY coalesce(sum(l.points), 0) DESC, count(l.game_id) FILTER (WHERE l.appeared) DESC,
         ${JERSEY_ORDER('p.jersey')}`,
      [id],
    );
    const games = await this.db.query<GameRow>(
      `SELECT * FROM live_stats.games WHERE home_team_id = $1 OR away_team_id = $1
       ORDER BY starts_at NULLS LAST, created_at`,
      [id],
    );
    const now = this.now();
    const list = games.rows.map((g) => summary(g, teams, now));
    const record = { wins: 0, losses: 0 };
    for (const g of list) {
      if (g.status !== 'final') continue;
      const mine = g.home.id === id ? g.homeScore : g.awayScore;
      const theirs = g.home.id === id ? g.awayScore : g.homeScore;
      if (mine > theirs) record.wins += 1;
      else if (mine < theirs) record.losses += 1;
    }
    return { team: t, players: players.rows, stats: stats.rows, games: list, record };
  }

  async teams() {
    const rows = await this.db.query<TeamRow>(
      'SELECT id, slug, name, school, tracked FROM live_stats.teams ORDER BY tracked DESC, name',
    );
    return rows.rows;
  }
}

/** Every player an action names must be on the roster of the team it is recorded for. */
async function checkPlayers(tx: Sql, g: GameRow, input: Command) {
  if (!('side' in input)) return;
  const ids =
    input.type === 'lineup'
      ? input.playerIds
      : input.type === 'sub'
        ? [input.inId, input.outId]
        : [input.playerId];
  const teamId = input.side === 'home' ? g.home_team_id : g.away_team_id;
  const rows = await tx.query<{ id: string; team_id: string }>(
    `SELECT id, team_id FROM live_stats.players
     WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)::uuid)`,
    [JSON.stringify(ids)],
  );
  const teamOf = new Map(rows.rows.map((r) => [r.id, r.team_id]));
  if (ids.some((id) => teamOf.get(id) !== teamId))
    throw new StoreError('That player is not on this team. Reload the roster.', 422);
}

/** A game as the schedule shows it: teams, score and enough of the clock to show it live. */
function summary(g: GameRow, teams: TeamRow[], now: number) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const d = derive(g.state);
  return {
    id: g.id,
    season: g.season,
    startsAt: iso(g.starts_at),
    venue: g.venue,
    venueAddress: g.venue_address,
    gameType: g.game_type,
    source: g.source,
    sourceRef: g.source_ref,
    sourceUrl: g.source_url,
    status: g.status,
    revision: g.revision,
    home: team(byId.get(g.home_team_id))!,
    away: team(byId.get(g.away_team_id))!,
    homeScore: g.home_score,
    awayScore: g.away_score,
    period: d.period,
    periods: g.state.rules.periods,
    clock: g.state.clock,
    serverTime: now,
  };
}

export type GameSummary = ReturnType<typeof summary>;
