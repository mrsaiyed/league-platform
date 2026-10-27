import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { GameState } from '../../../sports/src/basketball/live.ts';
import type {
  Fixture,
  GameRecord,
  GameStatus,
  LineRecord,
  LiveStatsRepository,
  PlayerChange,
  PlayerRecord,
  Recorded,
  TeamRecord,
} from './repository.ts';

/** The SQL the adapter needs. Embedded PGlite provides it as is; `connectPostgres` wraps a pool. */
export type Sql = { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
export type Db = Sql & {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  school: string;
  tracked: boolean;
  source_url: string;
};
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
  status: GameStatus;
  home_score: number;
  away_score: number;
  revision: number;
  state: GameState;
};
type LineRow = {
  player_id: string;
  team_id: string;
  name: string;
  jersey: string;
  appeared: boolean;
  points: number;
  fg1: number;
  fg2: number;
  fg3: number;
  fouls: number;
  ms: number | string;
};

const TEAM_COLUMNS = 'id, slug, name, school, tracked, source_url';
const PLAYER_COLUMNS = 'id, team_id AS "teamId", name, jersey, active';
// By jersey as the pages sort: 00, 0, 1 … 99, then players with no number by name.
const PLAYER_ORDER = "(jersey = ''), nullif(jersey, '')::int, length(jersey) DESC, lower(name)";
const GAME_ORDER = 'starts_at NULLS LAST, created_at, id';

const team = (r: TeamRow): TeamRecord => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  school: r.school,
  tracked: r.tracked,
  sourceUrl: r.source_url,
});
const game = (r: GameRow): GameRecord => ({
  id: r.id,
  season: r.season,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  startsAt: r.starts_at == null ? null : new Date(r.starts_at).toISOString(),
  venue: r.venue,
  venueAddress: r.venue_address,
  gameType: r.game_type,
  source: r.source,
  sourceRef: r.source_ref,
  sourceUrl: r.source_url,
  status: r.status,
  homeScore: r.home_score,
  awayScore: r.away_score,
  revision: r.revision,
  state: r.state,
});
const line = (r: LineRow): LineRecord => ({
  playerId: r.player_id,
  teamId: r.team_id,
  name: r.name,
  jersey: r.jersey,
  appeared: r.appeared,
  points: r.points,
  fg1: r.fg1,
  fg2: r.fg2,
  fg3: r.fg3,
  fouls: r.fouls,
  ms: Number(r.ms),
});

/** PostgreSQL: embedded PGlite on this computer, or a hosted database such as Supabase. */
export class PostgresRepository implements LiveStatsRepository {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async initialize() {
    await this.db.exec(await readFile(new URL('./001-schema.sql', import.meta.url), 'utf8'));
  }

  close() {
    return this.db.close();
  }

  async ensureTeam(t: Omit<TeamRecord, 'id'>) {
    const row = await this.db.query<TeamRow>(
      `INSERT INTO live_stats.teams(id, slug, name, school, tracked, source_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET slug = excluded.slug RETURNING ${TEAM_COLUMNS}`,
      [randomUUID(), t.slug, t.name, t.school, t.tracked, t.sourceUrl],
    );
    return team(row.rows[0]!);
  }

  async teams() {
    const rows = await this.db.query<TeamRow>(
      `SELECT ${TEAM_COLUMNS} FROM live_stats.teams ORDER BY tracked DESC, name`,
    );
    return rows.rows.map(team);
  }

  async upsertFixture(f: Fixture) {
    await this.db.query(
      `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, venue,
         venue_address, game_type, source, source_ref, source_url, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (source_ref) DO UPDATE SET starts_at = excluded.starts_at,
         venue = excluded.venue, venue_address = excluded.venue_address,
         game_type = excluded.game_type, source_url = excluded.source_url,
         home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id
       WHERE live_stats.games.status = 'scheduled' AND live_stats.games.revision = 0`,
      [
        f.id,
        f.season,
        f.homeTeamId,
        f.awayTeamId,
        f.startsAt,
        f.venue,
        f.venueAddress,
        f.gameType,
        f.source,
        f.sourceRef,
        f.sourceUrl,
        JSON.stringify(f.state),
      ],
    );
  }

  async games(filter: { teamId?: string } = {}) {
    const rows = filter.teamId
      ? await this.db.query<GameRow>(
          `SELECT * FROM live_stats.games WHERE home_team_id = $1 OR away_team_id = $1
           ORDER BY ${GAME_ORDER}`,
          [filter.teamId],
        )
      : await this.db.query<GameRow>(`SELECT * FROM live_stats.games ORDER BY ${GAME_ORDER}`);
    return rows.rows.map(game);
  }

  async game(id: string) {
    const rows = await this.db.query<GameRow>('SELECT * FROM live_stats.games WHERE id = $1', [id]);
    return rows.rows[0] ? game(rows.rows[0]) : null;
  }

  async players(teamIds: string[]) {
    const rows = await this.db.query<PlayerRecord>(
      `SELECT ${PLAYER_COLUMNS} FROM live_stats.players
       WHERE team_id IN (SELECT jsonb_array_elements_text($1::jsonb)::uuid) ORDER BY ${PLAYER_ORDER}`,
      [JSON.stringify(teamIds)],
    );
    return rows.rows;
  }

  async player(id: string) {
    const rows = await this.db.query<PlayerRecord>(
      `SELECT ${PLAYER_COLUMNS} FROM live_stats.players WHERE id = $1`,
      [id],
    );
    return rows.rows[0] ?? null;
  }

  async addPlayer(p: PlayerRecord) {
    await this.db.query(
      'INSERT INTO live_stats.players(id, team_id, name, jersey, active) VALUES ($1, $2, $3, $4, $5)',
      [p.id, p.teamId, p.name, p.jersey, p.active],
    );
  }

  async updatePlayer(id: string, change: PlayerChange) {
    const rows = await this.db.query<PlayerRecord>(
      `UPDATE live_stats.players SET name = coalesce($2, name), jersey = coalesce($3, jersey),
         active = coalesce($4, active), updated_at = now()
       WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
      [id, change.name ?? null, change.jersey ?? null, change.active ?? null],
    );
    return rows.rows[0] ?? null;
  }

  record(gameId: string, commandId: string, decide: (game: GameRecord) => Recorded) {
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query<GameRow>('SELECT * FROM live_stats.games WHERE id = $1 FOR UPDATE', [gameId])
      ).rows[0];
      if (!row) return 'missing' as const;
      const seen = await tx.query(
        'SELECT 1 FROM live_stats.game_events WHERE game_id = $1 AND command_id = $2',
        [gameId, commandId],
      );
      if (seen.rows.length) return 'duplicate' as const;
      const r = decide(game(row));
      await tx.query(
        `INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [gameId, row.revision + 1, commandId, JSON.stringify(r.command), r.acceptedAt],
      );
      await tx.query(
        `UPDATE live_stats.games SET state = $2, status = $3, home_score = $4, away_score = $5,
           revision = revision + 1, updated_at = now() WHERE id = $1`,
        [gameId, JSON.stringify(r.state), r.status, r.homeScore, r.awayScore],
      );
      await tx.query('DELETE FROM live_stats.player_game_lines WHERE game_id = $1', [gameId]);
      if (r.lines.length)
        await tx.query(
          `INSERT INTO live_stats.player_game_lines(game_id, player_id, team_id, name, jersey,
             appeared, points, fg1, fg2, fg3, fouls, ms)
           SELECT $1, x.player_id, x.team_id, x.name, x.jersey, x.appeared, x.points, x.fg1,
             x.fg2, x.fg3, x.fouls, x.ms
           FROM jsonb_to_recordset($2::jsonb) AS x(player_id uuid, team_id uuid, name text,
             jersey text, appeared boolean, points integer, fg1 integer, fg2 integer,
             fg3 integer, fouls integer, ms bigint)`,
          [
            gameId,
            JSON.stringify(
              r.lines.map((l) => ({
                player_id: l.playerId,
                team_id: l.teamId,
                name: l.name,
                jersey: l.jersey,
                appeared: l.appeared,
                points: l.points,
                fg1: l.fg1,
                fg2: l.fg2,
                fg3: l.fg3,
                fouls: l.fouls,
                ms: l.ms,
              })),
            ),
          ],
        );
      return 'recorded' as const;
    });
  }

  async finalLines(teamId: string) {
    const rows = await this.db.query<LineRow>(
      `SELECT l.player_id, l.team_id, l.name, l.jersey, l.appeared, l.points, l.fg1, l.fg2,
         l.fg3, l.fouls, l.ms
       FROM live_stats.player_game_lines l
       JOIN live_stats.games g ON g.id = l.game_id AND g.status = 'final'
       WHERE l.team_id = $1`,
      [teamId],
    );
    return rows.rows.map(line);
  }
}

/**
 * A pool on a hosted PostgreSQL database such as Supabase. Connections are
 * encrypted; pass the provider's CA certificate as `ca` to verify the server as
 * well, or `ssl: 'off'` for a database on this computer. SSL is set here rather
 * than by the connection string, so a copied string behaves the same everywhere.
 */
export async function connectPostgres(
  url: string,
  options: { ssl?: 'require' | 'off'; ca?: string | undefined; max?: number } = {},
): Promise<Db> {
  const { default: pg } = await import('pg');
  const target = new URL(url);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])
    target.searchParams.delete(key);
  const builtIn = pg.types.getTypeParser;
  const pool = new pg.Pool({
    connectionString: target.toString(),
    max: options.max ?? 5,
    ssl:
      options.ssl === 'off'
        ? false
        : options.ca
          ? { ca: options.ca, rejectUnauthorized: true }
          : { rejectUnauthorized: false },
    // bigint (minutes in milliseconds) as a number; values stay far below 2^53.
    types: {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        oid === 20 ? (v: string) => Number(v) : builtIn(oid, format)) as typeof builtIn,
    },
  });
  // An idle connection dropped by the provider must not take the server down; the pool reconnects.
  pool.on('error', (error) => console.error('Database connection lost:', error.message));
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params)) as unknown as { rows: T[] };
    },
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params)) as unknown as { rows: T[] };
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
