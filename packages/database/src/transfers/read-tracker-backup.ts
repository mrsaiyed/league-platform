import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type {
  BackupEvent,
  BackupGame,
  BackupGameStatus,
  BackupLine,
  BackupPlayer,
  BackupTeam,
  TrackerBackup,
} from './tracker-backup.ts';
import { TrackerBackupError } from './tracker-backup.ts';

export type ReadTrackerBackupOptions = {
  /** Where the working copy is made; the system's temporary folder by default. */
  workDir?: string;
};

/**
 * Reads a backup of the current live tracker's database: the folder that
 * `npm run stats:copy -- --to <folder>` writes (an embedded PostgreSQL data folder).
 *
 * The backup itself is never opened. Opening a database folder writes to it (its log,
 * its lock), so the folder is copied to a working folder first, the copy is read in a
 * read-only transaction, and the copy is deleted. The backup is byte-for-byte the same
 * afterwards (F-7, T-16).
 *
 * Every failure comes out as a TrackerBackupError saying which problem it is: the folder
 * is missing or cannot be copied, holds no database or one that will not open, lacks the
 * tracker's tables or columns, is open in a running stats server, or the working folder
 * cannot be used.
 *
 * The working folder defaults to the system's temporary folder, which is fine for a test
 * but not for real use: the caller (the import, step 2.58) should pass its own `workDir`,
 * a folder it owns on a disk with room for a copy of the backup.
 */
export async function readTrackerBackup(
  folder: string,
  options: ReadTrackerBackupOptions = {},
): Promise<TrackerBackup> {
  const source = path.resolve(folder);
  if (!existsSync(source)) throw new TrackerBackupError('missing', source);
  if (!existsSync(path.join(source, 'PG_VERSION')))
    throw new TrackerBackupError('not-a-database', source);
  if (await heldByRunningServer(source)) throw new TrackerBackupError('in-use', source);

  const workRoot = await prepareWorkDir(options.workDir ?? tmpdir(), source);
  let work: string;
  try {
    work = await mkdtemp(path.join(workRoot, 'tracker-backup-'));
  } catch (error) {
    throw new TrackerBackupError('work-dir-unusable', workRoot, error);
  }
  try {
    const copy = path.join(work, 'db');
    try {
      await cp(source, copy, { recursive: true });
    } catch (error) {
      throw new TrackerBackupError('unreadable', source, error);
    }
    // A server that opened the folder while it was being copied may have been writing to
    // it, so the copy cannot be trusted.
    if (await heldByRunningServer(source)) throw new TrackerBackupError('in-use', source);
    return await readCopy(copy, source);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function readCopy(copy: string, source: string): Promise<TrackerBackup> {
  const db = new PGlite(copy);
  try {
    try {
      await db.waitReady;
    } catch (error) {
      throw new TrackerBackupError('not-a-database', source, error);
    }
    return await db.transaction(async (tx) => {
      await tx.exec('SET TRANSACTION READ ONLY');
      return readAll(tx, source);
    });
  } catch (error) {
    if (error instanceof TrackerBackupError) throw error;
    throw new TrackerBackupError('not-a-tracker-backup', source, error);
  } finally {
    // The copy is thrown away, so a failure to close it matters to no one, and must not
    // hide the error that brought us here.
    await db.close().catch(() => undefined);
  }
}

/**
 * Makes sure the working folder exists and is not inside the backup: the copy would then
 * be written into the backup itself.
 */
async function prepareWorkDir(dir: string, source: string): Promise<string> {
  const resolved = path.resolve(dir);
  if (isInside(resolved, source)) throw new TrackerBackupError('work-dir-unusable', resolved);
  let real: string;
  try {
    await mkdir(resolved, { recursive: true });
    real = await realpath(resolved);
    // Through a link the working folder can still land inside the backup.
    if (isInside(real, await realpath(source)))
      throw new TrackerBackupError('work-dir-unusable', resolved);
  } catch (error) {
    if (error instanceof TrackerBackupError) throw error;
    throw new TrackerBackupError('work-dir-unusable', resolved, error);
  }
  return real;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

type Query = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

/** The columns read from each tracker table; `turnovers` may be missing (see below). */
const COLUMNS: Record<string, string[]> = {
  teams: ['id', 'slug', 'name', 'school', 'tracked', 'source_url'],
  players: ['id', 'team_id', 'name', 'jersey', 'active'],
  games: [
    'id',
    'season',
    'home_team_id',
    'away_team_id',
    'starts_at',
    'venue',
    'venue_address',
    'game_type',
    'source',
    'source_ref',
    'source_url',
    'status',
    'home_score',
    'away_score',
    'revision',
    'state',
  ],
  game_events: ['game_id', 'sequence', 'command_id', 'command', 'accepted_at'],
  player_game_lines: [
    'game_id',
    'player_id',
    'team_id',
    'name',
    'jersey',
    'appeared',
    'points',
    'fg1',
    'fg2',
    'fg3',
    'fouls',
    'ms',
  ],
};

async function readAll(db: Query, source: string): Promise<TrackerBackup> {
  const columns = new Map<string, Set<string>>();
  for (const row of (
    await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'live_stats'`,
    )
  ).rows) {
    const set = columns.get(row.table_name) ?? new Set<string>();
    set.add(row.column_name);
    columns.set(row.table_name, set);
  }
  const complete = Object.entries(COLUMNS).every(([table, needed]) => {
    const found = columns.get(table);
    return found !== undefined && needed.every((c) => found.has(c));
  });
  if (!complete) throw new TrackerBackupError('not-a-tracker-backup', source);

  const teams = (
    await db.query<TeamRow>(
      `SELECT id, slug, name, school, tracked, source_url FROM live_stats.teams ORDER BY slug, id`,
    )
  ).rows.map(
    (t): BackupTeam => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      school: t.school,
      tracked: t.tracked,
      sourceUrl: t.source_url,
    }),
  );

  const players = (
    await db.query<PlayerRow>(
      `SELECT id, team_id, name, jersey, active FROM live_stats.players ORDER BY team_id, id`,
    )
  ).rows.map(
    (p): BackupPlayer => ({
      id: p.id,
      teamId: p.team_id,
      name: p.name,
      jersey: p.jersey,
      active: p.active,
    }),
  );

  const events = new Map<string, BackupEvent[]>();
  for (const e of (
    await db.query<EventRow>(
      `SELECT game_id, sequence, command_id, command, accepted_at
       FROM live_stats.game_events ORDER BY game_id, sequence`,
    )
  ).rows)
    push(events, e.game_id, {
      seq: e.sequence,
      commandId: e.command_id,
      type: commandType(e.command),
      command: e.command,
      acceptedAt: iso(e.accepted_at),
    });

  // A backup made before the tracker kept turnovers has no such column: none to read.
  const turnovers = columns.get('player_game_lines')?.has('turnovers') ? 'turnovers' : '0';
  const lines = new Map<string, BackupLine[]>();
  for (const l of (
    await db.query<LineRow>(
      `SELECT game_id, player_id, team_id, name, jersey, appeared, points, fg1, fg2, fg3, fouls,
              ${turnovers} AS turnovers, ms
       FROM live_stats.player_game_lines ORDER BY game_id, team_id, player_id`,
    )
  ).rows)
    push(lines, l.game_id, {
      playerId: l.player_id,
      teamId: l.team_id,
      name: l.name,
      jersey: l.jersey,
      appeared: l.appeared,
      points: Number(l.points),
      fg1: Number(l.fg1),
      fg2: Number(l.fg2),
      fg3: Number(l.fg3),
      fouls: Number(l.fouls),
      turnovers: Number(l.turnovers),
      ms: Number(l.ms),
    });

  const games = (
    await db.query<GameRow>(
      `SELECT id, season, home_team_id, away_team_id, starts_at, venue, venue_address, game_type,
              source, source_ref, source_url, status, home_score, away_score, revision, state
       FROM live_stats.games ORDER BY starts_at NULLS LAST, id`,
    )
  ).rows.map(
    (g): BackupGame => ({
      id: g.id,
      season: g.season,
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
      startsAt: g.starts_at === null ? null : iso(g.starts_at),
      venue: g.venue,
      venueAddress: g.venue_address,
      gameType: g.game_type,
      source: g.source,
      sourceRef: g.source_ref,
      sourceUrl: g.source_url,
      status: g.status,
      homeScore: Number(g.home_score),
      awayScore: Number(g.away_score),
      revision: Number(g.revision),
      state: g.state,
      events: events.get(g.id) ?? [],
      lines: lines.get(g.id) ?? [],
    }),
  );

  return { teams, players, games };
}

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  school: string;
  tracked: boolean;
  source_url: string;
};
type PlayerRow = { id: string; team_id: string; name: string; jersey: string; active: boolean };
type EventRow = {
  game_id: string;
  sequence: number;
  command_id: string;
  command: unknown;
  accepted_at: Date | string;
};
type LineRow = {
  game_id: string;
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
  turnovers: number;
  ms: number | bigint | string;
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
  status: BackupGameStatus;
  home_score: number;
  away_score: number;
  revision: number;
  state: unknown;
};

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const iso = (value: Date | string) => new Date(value).toISOString();

function commandType(command: unknown): string | null {
  if (typeof command !== 'object' || command === null || !('type' in command)) return null;
  return typeof command.type === 'string' ? command.type : null;
}

/**
 * The stats server locks a database folder with `<folder>.lock` holding its process
 * id. A lock left by a process that has stopped does not count.
 */
async function heldByRunningServer(folder: string): Promise<boolean> {
  const pid = Number(await readFile(`${folder}.lock`, 'utf8').catch(() => ''));
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
